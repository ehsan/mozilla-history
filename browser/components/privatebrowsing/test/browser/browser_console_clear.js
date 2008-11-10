/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Private Browsing Tests.
 *
 * The Initial Developer of the Original Code is
 * Ehsan Akhgari.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Ehsan Akhgari <ehsan.akhgari@gmail.com> (Original Author)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either of the GNU General Public License Version 2 or later (the "GPL"),
 * or the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

// This test makes sure that the error console is cleared after leaving the
// private browsing mode.

function test() {
  // initialization
  let prefBranch = Cc["@mozilla.org/preferences-service;1"].
                   getService(Ci.nsIPrefBranch);
  prefBranch.setBoolPref("browser.privatebrowsing.keep_current_session", true);
  let pb = Cc["@mozilla.org/privatebrowsing;1"].
           getService(Ci.nsIPrivateBrowsingService);
  let consoleService = Cc["@mozilla.org/consoleservice;1"].
                       getService(Ci.nsIConsoleService);
  waitForExplicitFinish();

  let consoleObserver = {
    observe: function (aMessage) {
      if (!aMessage.message)
        this.gotNull = true;
    },
    gotNull: false
  };
  consoleService.registerListener(consoleObserver);

  function messageExists() {
    let out = {};
    consoleService.getMessageArray(out, {});
    let messages = out.value;
    if (!messages)
      messages = [];
    let found = false;
    for (let i = 0; i < messages.length; ++i)
      if (messages[i].message == kTestMessage) {
        found = true;
        break;
      }
    return found;
  }

  const kTestMessage = "Test message from the private browsing test";
  // make sure that the console is not empty
  consoleService.logStringMessage(kTestMessage);
  ok(!consoleObserver.gotNull, "Console shouldn't be cleared yet");
  ok(messageExists(), "Message should exist before leaving the private mode");

  pb.privateBrowsingEnabled = true;
  ok(!consoleObserver.gotNull, "Console shouldn't be cleared yet");
  ok(messageExists(), "Message should exist after entering the private mode");
  pb.privateBrowsingEnabled = false;

  let timer = Cc["@mozilla.org/timer;1"].
              createInstance(Ci.nsITimer);
  timer.initWithCallback({
    notify: function(timer) {
      // make sure that the null message was received
      ok(consoleObserver.gotNull, "Console should be cleared after leaving the private mode");
      // make sure the console does not contain kTestMessage
      ok(!messageExists(), "Message should not exist after leaving the private mode");

      consoleService.unregisterListener(consoleObserver);
      prefBranch.clearUserPref("browser.privatebrowsing.keep_current_session");
      finish();
    }
  }, 1000, Ci.nsITimer.TYPE_ONE_SHOT);
}