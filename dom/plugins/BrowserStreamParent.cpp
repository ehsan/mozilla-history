/* -*- Mode: C++; c-basic-offset: 2; indent-tabs-mode: nil; tab-width: 8 -*- */

#include "BrowserStreamParent.h"
#include "PluginInstanceParent.h"

namespace mozilla {
namespace plugins {

BrowserStreamParent::BrowserStreamParent(PluginInstanceParent* npp,
                                         NPStream* stream)
  : mNPP(npp)
  , mStream(stream)
{
  mStream->pdata = static_cast<AStream*>(this);
}

bool
BrowserStreamParent::AnswerNPN_RequestRead(const IPCByteRanges& ranges,
                                           NPError* result)
{
  _MOZ_LOG(__FUNCTION__);

  if (!mStream)
    return false;

  if (ranges.size() > PR_INT32_MAX) {
    // TODO: abort all processing!
    return false;
  }

  nsAutoArrayPtr<NPByteRange> rp(new NPByteRange[ranges.size()]);
  for (PRUint32 i = 0; i < ranges.size(); ++i) {
    rp[i].offset = ranges[i].offset;
    rp[i].length = ranges[i].length;
    rp[i].next = &rp[i + 1];
  }
  rp[ranges.size() - 1].next = NULL;

  *result = mNPP->mNPNIface->requestread(mStream, rp);
  return true;
}

int32_t
BrowserStreamParent::WriteReady()
{
  _MOZ_LOG(__FUNCTION__);

  int32_t result;
  if (!CallNPP_WriteReady(mStream->end, &result)) {
    mNPP->mNPNIface->destroystream(mNPP->mNPP, mStream, NPRES_NETWORK_ERR);
    // XXX is this right?
    return -1;
  }
  return result;
}

int32_t
BrowserStreamParent::Write(int32_t offset,
                           int32_t len,
                           void* buffer)
{
  _MOZ_LOG(__FUNCTION__);

  int32_t result;
  if (!CallNPP_Write(offset,
                     nsCString(static_cast<char*>(buffer), len),
                     &result)) {
    return -1;
  }

  if (result == -1)
    mNPP->CallPBrowserStreamDestructor(this, NPRES_USER_BREAK, true);
  return result;
}

void
BrowserStreamParent::StreamAsFile(const char* fname)
{
  _MOZ_LOG(__FUNCTION__);

  CallNPP_StreamAsFile(nsCString(fname));
}

NPError
BrowserStreamParent::NPN_DestroyStream(NPReason reason)
{
  _MOZ_LOG(__FUNCTION__);

  return mNPP->mNPNIface->destroystream(mNPP->mNPP, mStream, reason);
}

} // namespace plugins
} // namespace mozilla