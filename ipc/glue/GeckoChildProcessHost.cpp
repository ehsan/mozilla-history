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
 * The Original Code is Mozilla IPC.
 *
 * The Initial Developer of the Original Code is
 *   Ben Turner <bent.mozilla@gmail.com>.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
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

#include "GeckoChildProcessHost.h"

#include "base/command_line.h"
#include "base/path_service.h"
#include "base/string_util.h"
#include "chrome/common/chrome_switches.h"

using mozilla::ipc::GeckoChildProcessHost;

GeckoChildProcessHost::GeckoChildProcessHost(GeckoChildProcessType aProcessType)
  : ChildProcessHost(RENDER_PROCESS), // FIXME/cjones: we should own this enum
    mProcessType(aProcessType)
{
}

bool
GeckoChildProcessHost::Launch(std::vector<std::wstring> aExtraOpts)
{
  if (!CreateChannel()) {
    return false;
  }

  FilePath exePath =
    FilePath::FromWStringHack(CommandLine::ForCurrentProcess()->program());
  exePath = exePath.DirName();

  exePath = exePath.AppendASCII(MOZ_CHILD_PROCESS_NAME);

  // remap the IPC socket fd to a well-known int, as the OS does for
  // STDOUT_FILENO, for example
#if defined(OS_POSIX)
  int srcChannelFd, dstChannelFd;
  channel().GetClientFileDescriptorMapping(&srcChannelFd, &dstChannelFd);
  mFileMap.push_back(std::pair<int,int>(srcChannelFd, dstChannelFd));
#endif

  CommandLine cmdLine(exePath.ToWStringHack());
  cmdLine.AppendSwitchWithValue(switches::kProcessChannelID, channel_id());

  for (std::vector<std::wstring>::iterator it = aExtraOpts.begin();
       it != aExtraOpts.end();
       ++it) {
    cmdLine.AppendLooseValue((*it).c_str());
  }

  cmdLine.AppendLooseValue(UTF8ToWide(XRE_ChildProcessTypeToString(mProcessType)));

  base::ProcessHandle process;
#if defined(OS_WIN)
  base::LaunchApp(cmdLine, false, false, &process);
#elif defined(OS_POSIX)
  base::LaunchApp(cmdLine.argv(), mFileMap, false, &process);
#else
#error Bad!
#endif

  if (!process) {
    return false;
  }
  SetHandle(process);

  // FIXME/cjones: should have the option for sync/async launch.
  // however, since most clients already expect this launch to be 
  // synchronous wrt the channel connecting, we'll hack a bit here.
  // (at least we're on the IO thread and not blocking main ...)
  MessageLoop* loop = MessageLoop::current();
  bool old_state = loop->NestableTasksAllowed();
  loop->SetNestableTasksAllowed(true);
  // spin the loop until OnChannelConnected() comes in, which will Quit() us
  loop->Run();
  loop->SetNestableTasksAllowed(old_state);

  return true;
}

void
GeckoChildProcessHost::OnChannelConnected(int32 peer_pid)
{
    MessageLoop::current()->Quit();
}
void
GeckoChildProcessHost::OnMessageReceived(const IPC::Message& aMsg)
{
}

void
GeckoChildProcessHost::OnChannelError()
{
  // XXXbent Notify that the child process is gone?
}
