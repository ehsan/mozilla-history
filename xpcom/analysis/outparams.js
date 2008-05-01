require({ version: '1.8' });
require({ after_gcc_pass: 'cfg' });

include('treehydra.js');

include('util.js');
include('gcc_util.js');
include('gcc_print.js');
include('unstable/adts.js');
include('unstable/analysis.js');
include('unstable/esp.js');

include('liveness.js');
include('mayreturn.js');

MapFactory.use_injective = true;

let TRACE_FUNCTIONS = 0;
let TRACE_ESP = 0;
let TRACE_PERF = 0;
let LOG_RESULTS = false;

// Filter functions to process per CLI
let func_filter;
if (this.arg == undefined || this.arg == '') {
  func_filter = function(fd) true;
} else {
  func_filter = function(fd) function_decl_name(fd) == this.arg;
}

function process_tree(func_decl) {
  if (!func_filter(func_decl)) return;

  // Determine outparams and return if function not relevant
  let decl = rectify_function_decl(func_decl);
  if (decl.resultType != 'nsresult') return;

  let psem = OutparamCheck.prototype.func_param_semantics(func_decl);
  let params = [ v for (v in flatten_chain(DECL_ARGUMENTS(func_decl))) ];
  let outparam_list = [];
  let psem_list = [];
  for (let i = 0; i < psem.length; ++i) {
    if (psem[i] == ps.OUT || psem[i] == ps.INOUT) {
      outparam_list.push(params[i]);
      psem_list.push(psem[i]);
    }
  }
  if (outparam_list.length == 0) return;

  // At this point we have a function we want to analyze
  let fstring = rfunc_string(decl);
  if (TRACE_FUNCTIONS) print('* function ' + fstring);
  if (TRACE_PERF) timer_start(fstring);
  for (let i = 0; i < outparam_list.length; ++i) {
    let p = outparam_list[i];
    if (TRACE_FUNCTIONS) {
      print("  outparam " + expr_display(p) + " " + DECL_UID(p) + ' ' + 
            psem_list[i].label);
    }
  }

  let cfg = function_decl_cfg(func_decl);

  {
    let trace = 0;
    let b = new LivenessAnalysis(cfg, trace);
    b.run();
    for (let bb in cfg_bb_iterator(cfg)) {
      bb.liveVarsIn = bb.stateIn;
      bb.liveVarsOut = bb.stateOut;
    }
  }
  
  let [retvar, retvars] = function() {
    let trace = 0;
    let a = new MayReturnAnalysis(cfg, trace);
    a.run();
    return [a.retvar, a.vbls];
  }();
  if (retvar == undefined) throw new Error("assert");

  {
    let trace = TRACE_ESP;
    let fts = link_switches(cfg);
    let a = new OutparamCheck(cfg, psem_list, outparam_list, retvar, retvars, fts, trace);
    // This is annoying, but this field is only used for logging anyway.
    a.fndecl = func_decl;
    a.run();
    a.check();
  }
  
  if (TRACE_PERF) timer_stop(fstring);
}

// Outparam check analysis
function OutparamCheck(cfg, psem_list, outparam_list, retvar, retvar_set, finally_tmps, trace) {
  this.retvar = retvar;
  this.psem_list = psem_list;
  // We need both an ordered set and a lookup structure
  this.outparam_list = outparam_list
  this.outparams = create_decl_set(outparam_list);
  this.psvar_list = outparam_list.slice(0);
  for (let v in retvar_set.items()) {
    this.psvar_list.push(v);
  }
  for each (let v in finally_tmps) {
    this.psvar_list.push(v);
  }
  if (trace) {
    print("PS vars");
    for each (let v in this.psvar_list) {
      print("    " + expr_display(v));
    }
  }
  ESP.Analysis.call(this, cfg, this.psvar_list, av.BOTTOM, trace);
}

// Abstract values for outparam check
function AbstractValue(name, ch) {
  this.name = name;
  this.ch = ch;
}

AbstractValue.prototype.equals = function(v) {
  return this === v;
}

AbstractValue.prototype.toString = function() {
  return this.name + ' (' + this.ch + ')';
}

let avspec = [
  // General-purpose abstract values
  [ 'BOTTOM',        '.' ],   // any value, also used for dead vars

  // Abstract values for outparam contents write status
  [ 'NULL',          'x' ],   // is a null pointer
  [ 'NOT_WRITTEN',   '-' ],   // not written
  [ 'WROTE_NULL',    '/' ],   // had NULL written to
  [ 'WRITTEN',       '+' ],   // had anything written to
  // MAYBE_WRITTEN is special. "Officially", it means the same thing as
  // NOT_WRITTEN. What it really means is that an outparam was passed
  // to another function as a possible outparam (outparam type, but not
  // in last position), so if there is an error with it not being written,
  // we can give a hint about the possible outparam in the warning.
  [ 'MAYBE_WRITTEN', '?' ],   // written if possible outparam is one
  
  // Abstract values for rvs
  [ 'ZERO',          '0' ],   // zero value
  [ 'NONZERO',       '1' ]    // nonzero value
];

let av = {};
for each (let [name, ch] in avspec) {
  av[name] = new AbstractValue(name, ch);
}

av.ZERO.negation = av.NONZERO;
av.NONZERO.negation = av.ZERO;

let cachedAVs = {};

// Abstract values for int constants. We use these to figure out feasible
// paths in the presence of GCC finally_tmp-controlled switches.
function makeIntAV(v) {
  let key = 'int_' + v;
  if (cachedAVs.hasOwnProperty(key)) return cachedAVs[key];

  let s = "" + v;
  let ans = cachedAVs[key] = new AbstractValue(s, s);
  ans.int_val = v;
  return ans;
}

// Abstract values for pointers that contain a copy of an outparam 
// pointer. We use these to figure out writes to a casted copy of 
// an outparam passed to another method.
function makeOutparamAV(v) {
  let key = 'outparam_' + DECL_UID(v);
  if (cachedAVs.hasOwnProperty(key)) return cachedAVs[key];

  let ans = cachedAVs[key] = 
    new AbstractValue('OUTPARAM:' + expr_display(v), 'P');
  ans.outparam = v;
  return ans;
}

// Outparam check analysis
OutparamCheck.prototype = new ESP.Analysis;

OutparamCheck.prototype.startValues = function() {
  let ans = create_decl_map();
  for each (let p in this.psvar_list) {
    ans.put(p, this.outparams.has(p) ? av.NOT_WRITTEN : av.BOTTOM);
  }
  return ans;
}

OutparamCheck.prototype.flowState = function(isn, state) {
  switch (TREE_CODE(isn)) {
  case GIMPLE_MODIFY_STMT:
    this.processAssign(isn, state);
    break;
  case CALL_EXPR:
    this.processCall(undefined, isn, isn, state);
    break;
  case SWITCH_EXPR:
  case COND_EXPR:
    // This gets handled by flowStateCond instead, has no exec effect
    break;
  case RETURN_EXPR:
    this.processAssign(isn.operands()[0], state);
    break;
  case LABEL_EXPR:
  case RESX_EXPR:
  case ASM_EXPR:
    // NOPs for us
    break;
  default:
    print(TREE_CODE(isn));
    throw new Error("ni");
  }
}

OutparamCheck.prototype.flowStateCond = function(isn, truth, state) {
  switch (TREE_CODE(isn)) {
  case COND_EXPR:
    this.flowStateIf(isn, truth, state);
    break;
  case SWITCH_EXPR:
    this.flowStateSwitch(isn, truth, state);
    break;
  default:
    throw new Error("ni " + TREE_CODE(isn));
  }
}

OutparamCheck.prototype.flowStateIf = function(isn, truth, state) {
  let exp = TREE_OPERAND(isn, 0);

  if (DECL_P(exp)) {
    this.filter(state, exp, av.NONZERO, truth, isn);
    return;
  }

  switch (TREE_CODE(exp)) {
  case EQ_EXPR:
  case NE_EXPR:
    // Handle 'x op <int lit>' pattern only
    let op1 = TREE_OPERAND(exp, 0);
    let op2 = TREE_OPERAND(exp, 1);
    if (expr_literal_int(op1) != undefined) {
      [op1,op2] = [op2,op1];
    }
    if (!DECL_P(op1)) break;
    if (expr_literal_int(op2) != 0) break;
    let val = TREE_CODE(exp) == EQ_EXPR ? av.ZERO : av.NONZERO;

    this.filter(state, op1, val, truth, isn);
    break;
  default:
    // Don't care about anything else.
  }

};

OutparamCheck.prototype.flowStateSwitch = function(isn, truth, state) {
  let exp = TREE_OPERAND(isn, 0);

  if (DECL_P(exp)) {
    if (truth != null) {
      this.filter(state, exp, makeIntAV(truth), true, isn);
    }
    return;
  }
  throw new Error("ni");
}

// Apply a filter to the state. We need to special case it for this analysis
// because outparams only care about being a NULL pointer.
OutparamCheck.prototype.filter = function(state, vbl, val, truth, blame) {
  if (truth != true && truth != false) throw new Error("ni " + truth);
  if (this.outparams.has(vbl)) {
    // We do need to check for true and false here because other values
    // could get passed in from switches.
    if (truth == true && val == av.ZERO || truth == false && val == av.NONZERO) {
      state.assignValue(vbl, av.NULL, blame);
    }
  } else {
    if (truth == false) {
      val = val.negation;
    }
    state.filter(vbl, val, blame);
  }
};

OutparamCheck.prototype.processAssign = function(isn, state) {
  let lhs = isn.operands()[0];
  let rhs = isn.operands()[1];

  if (DECL_P(lhs)) {
    // Unwrap NOP_EXPR, which is semantically a copy.
    if (TREE_CODE(rhs) == NOP_EXPR) {
      rhs = rhs.operands()[0];
    }

    if (DECL_P(rhs)) {
      if (this.outparams.has(rhs)) {
        // Copying an outparam pointer. We have to remember this so that
        // if it is assigned thru later, we pick up the write.
        state.assignValue(lhs, makeOutparamAV(rhs), isn);
      } else {
        state.assign(lhs, rhs, isn);
      }
      return
    }
    
    switch (TREE_CODE(rhs)) {
    case INTEGER_CST:
      if (this.outparams.has(lhs)) {
        warning("assigning to outparam pointer");
      } else {
        // Need to know the exact int value for finally_tmp.
        if (is_finally_tmp(lhs)) {
          let v = TREE_INT_CST_LOW(rhs);
          state.assignValue(lhs, makeIntAV(v), isn);
        } else {
          let value = expr_literal_int(rhs) == 0 ? av.ZERO : av.NONZERO;
          state.assignValue(lhs, value, isn);
        }
      }
      break;
    case NE_EXPR: {
      // We only care about gcc-generated x != 0 for conversions and such.
      let [op1, op2] = rhs.operands();
      if (DECL_P(op1) && expr_literal_int(op2) == 0) {
        state.assign(lhs, op1, isn);
      }
    }
      break;
    case EQ_EXPR: {
      // We only care about testing outparams for NULL (and then not writing)
      let [op1, op2] = rhs.operands();
      if (DECL_P(op1) && this.outparams.has(op1) && expr_literal_int(op2) == 0) {
        state.update(function(ss) {
          let [s1, s2] = [ss, ss.copy()]; // s1 true, s2 false
          s1.assignValue(lhs, av.NONZERO, isn);
          s1.assignValue(op1, av.NULL, isn);
          s2.assignValue(lhs, av.ZERO, isn);
          return [s1, s2];
        });
      }
    }
      break;
    case CALL_EXPR:
      let fname = call_function_name(rhs);
      if (fname == 'NS_FAILED') {
        this.processTest(lhs, rhs, av.NONZERO, isn, state);
      } else if (fname == 'NS_SUCCEEDED') {
        this.processTest(lhs, rhs, av.ZERO, isn, state);
      } else if (fname == '__builtin_expect') {
        // Same as an assign from arg 0 to lhs
        state.assign(lhs, call_args(rhs)[0], isn);
      } else {
        this.processCall(lhs, rhs, isn, state);
      }
      break;
    // Stuff we don't analyze -- just kill the LHS info
    case ADDR_EXPR:
    case POINTER_PLUS_EXPR:
    case ARRAY_REF:
    case COMPONENT_REF:
    case INDIRECT_REF:
    case FILTER_EXPR:
    case EXC_PTR_EXPR:
    case CONSTRUCTOR:

    case REAL_CST:
    case STRING_CST:

    case CONVERT_EXPR:
    case TRUTH_NOT_EXPR:
    case TRUTH_XOR_EXPR:
    case BIT_FIELD_REF:
      state.remove(lhs);
      break;
    default:
      if (UNARY_CLASS_P(rhs) || BINARY_CLASS_P(rhs) || COMPARISON_CLASS_P(rhs)) {
        state.remove(lhs);
        break;
      }
      print(TREE_CODE(rhs));
      throw new Error("ni");
    }
    return;
  }

  switch (TREE_CODE(lhs)) {
  case INDIRECT_REF:
    // Writing to an outparam. We want to try to figure out if we're writing NULL.
    let e = TREE_OPERAND(lhs, 0);
    if (this.outparams.has(e)) {
      if (expr_literal_int(rhs) == 0) {
        state.assignValue(e, av.WROTE_NULL, isn);
      } else if (DECL_P(rhs)) {
        state.update(function(ss) {
          let [s1, s2] = [ss.copy(), ss]; // s1 NULL, s2 non-NULL
          s1.assignValue(e, av.WROTE_NULL, isn);
          s1.assignValue(rhs, av.ZERO, isn);
          s2.assignValue(e, av.WRITTEN, isn);
          s2.assignValue(rhs, av.NONZERO, isn);
          return [s1,s2];
        });
      } else {
        state.assignValue(e, av.WRITTEN, isn);
      }
    } else {
      // unsound -- could be writing to anything through this ptr
    }
    break;
  case COMPONENT_REF: // unsound
  case ARRAY_REF: // unsound
  case EXC_PTR_EXPR:
  case FILTER_EXPR:
    break;
  default:
    print(TREE_CODE(lhs));
    throw new Error("ni");
  }
}

// Handle an assignment x := test(foo) where test is a simple predicate
OutparamCheck.prototype.processTest = function(lhs, call, val, blame, state) {
  let arg = call_arg(call, 0);
  if (DECL_P(arg)) {
    state.predicate(lhs, val, arg, blame);
  } else {
    state.assignValue(lhs, av.BOTTOM, blame);
  }
};

// The big one: outparam semantics of function calls.
OutparamCheck.prototype.processCall = function(dest, expr, blame, state) {
  let args = call_args(expr);
  let callable = callable_arg_function_decl(TREE_OPERAND(expr, 1));
  let psem = this.func_param_semantics(callable);
    
  //print('PSEM ' + psem);

  if (args.length != psem.length) {
    let ct = TREE_TYPE(callable);
    if (TREE_CODE(ct) == POINTER_TYPE) ct = TREE_TYPE(ct);
    if (args.length < psem.length || !stdarg_p(ct)) {
      //print("TTT " + type_string(ct));
      let name = function_decl_name(callable);
      // TODO Can __builtin_memcpy write to an outparam? Probably not.
      if (name != 'operator new' && name != 'operator delete' &&
          name != 'operator new []' && name != 'operator delete []' &&
          name.substr(0, 5) != '__cxa' &&
          name.substr(0, 9) != '__builtin') {
        throw Error("bad len for '" + name + "': " + args.length + ' args, ' + 
                    psem.length + ' params');
      }
    }
  }

  // Collect variables that are possibly written to on callee success
  let updates = [];
  for (let i = 0; i < psem.length; ++i) {
    let arg = args[i];
    // The arg could be a copy of an outparam. We'll unwrap to the
    // outparam if it is. The following is cheating a bit because
    // we munge states together, but it should be OK in practice.
    arg = unwrap_outparam(arg, state);
    let sem = psem[i];
    if (sem == ps.CONST) continue;
    // At this point, we know the call can write thru this param.
    // Invalidate any vars whose addresses are passed here.
    if (TREE_CODE(arg) == ADDR_EXPR) {
      let v = arg.operands()[0];
      if (DECL_P(v)) {
        state.remove(v);
      }
    }
    if (!DECL_P(arg) || !this.outparams.has(arg)) continue;
    // At this point, we may be writing to an outparam 
    updates.push([arg, sem]);
  }
  
  if (updates.length) {
    if (dest != undefined && DECL_P(dest)) {
      // Update & stored rv. Do updates predicated on success.
      state.update(function(ss) {
        let [s1, s2] = [ss.copy(), ss]; // s1 success, s2 fail
        for each (let [vbl, sem] in updates) {
          s1.assignValue(vbl, sem.val, blame);
          s1.assignValue(dest, av.ZERO, blame);
        }
        s2.assignValue(dest, av.NONZERO, blame);
        return [s1,s2];
      });
    } else {
      // Discarded rv. Per spec in the bug, we assume that either success
      // or failure is possible (if not, callee should return void).
      // Exceptions: Methods that return void and string mutators are
      //     considered no-fail.
      state.update(function(ss) {
        for each (let [vbl, sem] in updates) {
          if (sem == ps.OUTNOFAIL) {
            ss.assignValue(vbl, av.WRITTEN, blame);
            return [ss];
          } else {
            let [s1, s2] = [ss.copy(), ss]; // s1 success, s2 fail
            for each (let [vbl, sem] in updates) {
              s1.assignValue(vbl, sem.val, blame);
            }
            return [s1,s2];
          }
        }
      });
    }
  } else {
    // no updates, just kill any destination for the rv
    if (dest != undefined && DECL_P(dest)) {
      state.remove(dest, blame);
    }
  }
};

function unwrap_outparam(arg, state) {
  if (!DECL_P(arg) || state.factory.outparams.has(arg)) return arg;

  let outparam;
  for (let ss in state.substates.getValues()) {
    let val = ss.get(arg);
    if (val != undefined && val.hasOwnProperty('outparam')) {
      outparam = val.outparam;
    }
  }
  if (outparam) return outparam;
  return arg;
}

// Check for errors. Must .run() analysis before calling this.
OutparamCheck.prototype.check = function() {
  let state = this.cfg.x_exit_block_ptr.stateOut;
  for (let substate in state.substates.getValues()) {
    this.checkSubstate(substate);
  }
}

OutparamCheck.prototype.checkSubstate = function(ss) {
  let rv = ss.get(this.retvar);
  switch (rv) {
  case av.ZERO:
    this.checkSubstateSuccess(ss);
    break;
  case av.NONZERO:
    this.checkSubstateFailure(ss);
    break;
  default:
    throw new Error("ni " + rv);
  }
}

OutparamCheck.prototype.checkSubstateSuccess = function(ss) {
  for (let i = 0; i < this.psem_list.length; ++i) {
    let [v, psem] = [ this.outparam_list[i], this.psem_list[i] ];
    if (psem == ps.INOUT) continue;
    let val = ss.get(v);
    if (val == av.NOT_WRITTEN) {
      this.logResult('succ', 'not_written', 'error');
      this.warn("outparam not written on NS_SUCCEEDED(return value)",
                v, this.formatBlame('Return at', ss, this.retvar));
    } else if (val == av.MAYBE_WRITTEN) {
      this.logResult('succ', 'maybe_written', 'error');
      this.warn("outparam not written on NS_SUCCEEDED(return value)", v,
                this.formatBlame('Return at', ss, this.retvar),
                this.formatBlame('Possibly written by unannotated outparam in call at', ss, v));
    } else { 
      this.logResult('succ', '', 'ok');
    }
  }    
}

OutparamCheck.prototype.checkSubstateFailure = function(ss) {
  for (let i = 0; i < this.psem_list.length; ++i) {
    let [v, ps] = [ this.outparam_list[i], this.psem_list[i] ];
    let val = ss.get(v);
    if (val == av.WRITTEN) {
      this.logResult('fail', 'written', 'error');
      this.warn("outparam written on NS_FAILED(return value)", v,
                this.formatBlame('Return at', ss, this.retvar),
                this.formatBlame('Written at', ss, v));
    } else if (val == av.WROTE_NULL) {
      this.logResult('fail', 'wrote_null', 'warning');
      this.warn("NULL written to outparam on NS_FAILED(return value)", v,
                this.formatBlame('Return at', ss, this.retvar),
                this.formatBlame('Written at', ss, v));
    } else {
      this.logResult('fail', '', 'ok');
    }
  }    
}

OutparamCheck.prototype.warn = function() {
  let tag = arguments[0];
  let v = arguments[1];
  let rest = Array.slice(arguments, 2);

  let label = expr_display(v)
  let lines = [ tag + ': ' + label,
              'Outparam declared at: ' + loc_string(location_of(v)) ];
  lines = lines.concat(rest);
  let msg = lines.join('\n    ');
  warning(msg);
}

OutparamCheck.prototype.formatBlame = function(msg, ss, v) {
  let blame = ss.getBlame(v);
  let loc = blame ? loc_string(location_of(blame)) : '?';
  return(msg + ": " + loc);
}

OutparamCheck.prototype.logResult = function(rv, msg, kind) {
  if (LOG_RESULTS) {
    let s = [ '"' + x + '"' for each (x in [ loc_string(location_of(this.fndecl)), function_decl_name(this.fndecl), rv, msg, kind ]) ].join(', ');
    print(":LR: (" + s + ")");
  }
}

// Parameter Semantics values -- indicates whether a parameter is
// an outparam.
let ps = {
  OUTNOFAIL: { label: 'out-no-fail', val: av.WRITTEN },
  OUT:       { label: 'out',   val: av.WRITTEN },
  INOUT:     { label: 'inout',   val: av.WRITTEN },
  MAYBE:     { label: 'maybe', val: av.MAYBE_WRITTEN},  // maybe out
  CONST:     { label: 'const' }   // i.e. not out
};

// Return the param semantics of a FUNCTION_DECL or VAR_DECL representing
// a function pointer.
OutparamCheck.prototype.func_param_semantics = function(callable) {
  let ans = [];
  let ftype = TREE_TYPE(callable);
  if (TREE_CODE(ftype) == POINTER_TYPE) ftype = TREE_TYPE(ftype);
  let is_func = TREE_CODE(callable) == FUNCTION_DECL;
  if (is_func) {
    ans = [ param_semantics(p) for (p in function_decl_params(callable)) ];
  }
  //if (array_all(ans, function (p) p == ps.CONST)) {
  if (ans.every(function (p) p == ps.CONST)) {
    if (is_func) {
      ans = [ param_semantics_by_type(TREE_TYPE(p)) 
              for (p in function_decl_params(callable)) ];
    } else {
      ans = [ param_semantics_by_type(p) 
              for (p in function_type_args(ftype)) 
                if (TREE_CODE(p) != VOID_TYPE) ];
    }
    // Params other than the last should be maybes instead of out.
    for (let i = 0; i < ans.length - 1; ++i) {
      if (ans[i] == ps.OUT) ans[i] = ps.MAYBE;
    }
    //print("BYTYPE " + ans);
  }
  // Special case to catch string mutators. Note that they will never
  // be so annotated in attributes.
  if (is_func && is_string_mutator(callable)) {
    ans[0] = ps.OUTNOFAIL;
  }
  // Special case for methods that return void.
  if (TREE_CODE(TREE_TYPE(ftype)) == VOID_TYPE) {
    for (let i = 0; i < ans.length; ++i) {
      if (ans[i] == ps.OUT) ans[i] = ps.OUTNOFAIL;
    }
  }

  return ans;
};

// Return the param semantics as indicated by the attributes.
function param_semantics(decl) {
  for each (let attr in rectify_attributes(DECL_ATTRIBUTES(decl))) {
    if (attr.name == 'user') {
      for each (let arg in attr.args) {
        if (arg == 'outparam') {
          return ps.OUT;
        } else if (arg == 'inoutparam') {
          return ps.INOUT;
        }
      }
    }
  }
  return ps.CONST;
}

// Return param semantics as guessed from types.
function param_semantics_by_type(type) {
  switch (TREE_CODE(type)) {
  case POINTER_TYPE:
    let pt = TREE_TYPE(type);
    switch (TREE_CODE(pt)) {
    case RECORD_TYPE:
      // TODO: should we consider field writes?
      return ps.CONST;
    case POINTER_TYPE:
      // Outparam if nsIFoo** or void **
      let ppt = TREE_TYPE(pt);
      let tname = TYPE_NAME(ppt);
      if (tname == undefined) return ps.CONST;
      let name = decl_name_string(tname);
      return name == 'void' || name == 'char' || name == 'PRUnichar' ||
        name.substr(0, 3) == 'nsI' ?
        ps.OUT : ps.CONST;
    case INTEGER_TYPE: {
      let name = decl_name_string(TYPE_NAME(pt));
      return name != 'char' && name != 'PRUnichar' ? ps.OUT : ps.CONST;
    }
    case ENUMERAL_TYPE:
    case REAL_TYPE:
    case UNION_TYPE:
      return TYPE_READONLY(pt) ? ps.CONST : ps.OUT;
    case FUNCTION_TYPE:
    case VOID_TYPE:
      return ps.CONST;
    default:
      print("Y " + TREE_CODE(pt));
      print('Y ' + type_string(pt));
      throw new Error("ni");
    }
    break;
  case REFERENCE_TYPE:
    let rt = TREE_TYPE(type);
    return !TYPE_READONLY(rt) && is_string_type(rt) ? ps.OUT : ps.CONST;
  case INTEGER_TYPE:
  case REAL_TYPE:
  case ENUMERAL_TYPE:
  case RECORD_TYPE:
  case UNION_TYPE:    // unsafe, c/b pointer
    return ps.CONST;
  default:
    print("Z " + TREE_CODE(type));
    print('Z ' + type_string(type));
    throw new Error("ni");
  }
}

// Map type name to boolean as to whether it is a string.
let cached_string_types = MapFactory.create_map(
  function (x, y) x == y,
  function (x) x,
  function (t) t,
  function (t) t);

// Base string types. Others will be found by searching the inheritance
// graph.

cached_string_types.put('nsAString', true);
cached_string_types.put('nsACString', true);
cached_string_types.put('nsAString_internal', true);
cached_string_types.put('nsACString_internal', true);

// Return true if the given type represents a Mozilla string type.
// The binfo arg is the binfo to use for further iteration. This is
// for internal use only, users of this function should pass only
// one arg.
function is_string_type(type, binfo) {
  if (TREE_CODE(type) != RECORD_TYPE) return false;
  //print(">>>IST " + type_string(type));
  let name = decl_name_string(TYPE_NAME(type));
  let ans = cached_string_types.get(name);
  if (ans != undefined) return ans;

  ans = false;
  binfo = binfo != undefined ? binfo : TYPE_BINFO(type);
  if (binfo != undefined) {
    for each (let base in VEC_iterate(BINFO_BASE_BINFOS(binfo))) {
      let parent_ans = is_string_type(BINFO_TYPE(base), base);
      if (parent_ans) {
        ans = true;
        break;
      }
    }
  }
  cached_string_types.put(name, ans);
  //print("<<<IST " + type_string(type) + ' ' + ans);
  return ans;
}

function is_string_ptr_type(type) {
  return TREE_CODE(type) == POINTER_TYPE && is_string_type(TREE_TYPE(type));
}

// Return true if the given function is a mutator method of a Mozilla
// string type.
function is_string_mutator(fndecl) {
  let first_param = function() {
    for (let p in function_decl_params(fndecl)) {
      return p;
    }
    return undefined;
  }();

  return first_param != undefined && 
    decl_name_string(first_param) == 'this' &&
    is_string_ptr_type(TREE_TYPE(first_param)) &&
    !TYPE_READONLY(TREE_TYPE(TREE_TYPE(first_param)));
}

