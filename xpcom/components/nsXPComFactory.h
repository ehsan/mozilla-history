/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * The contents of this file are subject to the Netscape Public License
 * Version 1.0 (the "License"); you may not use this file except in
 * compliance with the License.  You may obtain a copy of the License at
 * http://www.mozilla.org/NPL/
 *
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.  See
 * the License for the specific language governing rights and limitations
 * under the License.
 *
 * The Original Code is Mozilla Communicator client code.
 *
 * The Initial Developer of the Original Code is Netscape Communications
 * Corporation.  Portions created by Netscape are Copyright (C) 1998
 * Netscape Communications Corporation.  All Rights Reserved.
 */

#ifndef nsXPComFactory_h__
#define nsXPComFactory_h__

#include "nsIFactory.h"

/*
 * This file contains a macro for the implementation of a simple XPCOM factory.
 *
 * To implement a factory for a given component, you need to declare the
 * factory class using the NS_DEF_FACTORY() macro.
 *
 * The first macro argument is the name for the factory.  
 * 
 * The second macro argument is a function (provided by you) which 
 * can be called by your DLL's NSGetFactory(...) entry point.
 *
 * Example:
 *
 *   NS_DEF_FACTORY(SomeComponent,SomeComponentImpl)
 *
 *   Declares:
 *   
 *     class nsSomeComponentFactory : public nsIFactory {};
 *
 * NOTE that the NS_DEF_FACTORY takes care of enforcing the "ns" prefix
 * and appending the "Factory" suffix to the given name.
 *
 *   To use the new factory:
 *
 *     nsresult NS_New_SomeComponent_Factory(nsIFactory** aResult)
 *     {
 *       nsresult rv = NS_OK;
 *       nsIFactory* inst = new nsSomeComponentFactory;
 *       if (NULL == inst) {
 *         rv = NS_ERROR_OUT_OF_MEMORY;
 *       } else {
 *         NS_ADDREF(inst);
 *       }
 *       *aResult = inst;
 *       return rv;
 *     }
 *
 * NOTE:
 * ----
 *  The factories created by this macro are not thread-safe and do not
 *  support aggregation.
 *
 */
#define NS_DEF_FACTORY(_name,_type)                               \
class ns##_name##Factory : public nsIFactory                      \
{                                                                 \
public:                                                           \
  NS_DECL_ISUPPORTS                                               \
                                                                  \
  ns##_name##Factory() { NS_INIT_REFCNT(); }                      \
                                                                  \
  NS_IMETHOD CreateInstance(nsISupports *aOuter,                  \
                            const nsIID &aIID,                    \
                            void **aResult)                       \
  {                                                               \
    nsresult rv;                                                  \
                                                                  \
    _type * inst;                                                 \
                                                                  \
    if (NULL == aResult) {                                        \
      rv = NS_ERROR_NULL_POINTER;                                 \
      goto done;                                                  \
    }                                                             \
    *aResult = NULL;                                              \
    if (NULL != aOuter) {                                         \
      rv = NS_ERROR_NO_AGGREGATION;                               \
      goto done;                                                  \
    }                                                             \
                                                                  \
    NS_NEWXPCOM(inst, _type);                                     \
    if (NULL == inst) {                                           \
      rv = NS_ERROR_OUT_OF_MEMORY;                                \
      goto done;                                                  \
    }                                                             \
    NS_ADDREF(inst);                                              \
    rv = inst->QueryInterface(aIID, aResult);                     \
    NS_RELEASE(inst);                                             \
                                                                  \
  done:                                                           \
    return rv;                                                    \
  }                                                               \
                                                                  \
  NS_IMETHOD LockFactory(PRBool aLock)                            \
  {                                                               \
    return NS_OK;                                                 \
  }                                                               \
                                                                  \
protected:                                                        \
  virtual ~ns##_name##Factory()                                   \
  {                                                               \
    NS_ASSERTION(mRefCnt == 0, "non-zero refcnt at destruction"); \
  }                                                               \
};                                                                \
NS_IMPL_ISUPPORTS1(ns##_name##Factory, nsIFactory);

#endif /* nsXPComFactory_h__ */
