/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: sw=2 ts=2 et lcs=trail\:.,tab\:>~ :
 * ***** BEGIN LICENSE BLOCK *****
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
 * The Original Code is the Mozilla SVG project.
 *
 * The Initial Developer of the Original Code is
 * Crocodile Clips Ltd..
 * Portions created by the Initial Developer are Copyright (C) 2001
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Alex Fritze <alex.fritze@crocodile-clips.com> (original author)
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

#include "DOMSVGMatrix.h"
#include "nsDOMError.h"
#include <math.h>
#include "nsContentUtils.h"

const double radPerDegree = 2.0*3.1415926535 / 360.0;

namespace mozilla {

//----------------------------------------------------------------------
// nsISupports methods:

// Make sure we clear the weak ref in the owning transform (if there is one)
// upon unlink.
NS_IMPL_CYCLE_COLLECTION_CLASS(DOMSVGMatrix)
NS_IMPL_CYCLE_COLLECTION_UNLINK_BEGIN(DOMSVGMatrix)
  if (tmp->mTransform) {
    tmp->mTransform->ClearMatrixTearoff(tmp);
  }
NS_IMPL_CYCLE_COLLECTION_UNLINK_NSCOMPTR(mTransform)
NS_IMPL_CYCLE_COLLECTION_UNLINK_END
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_BEGIN(DOMSVGMatrix)
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_NSCOMPTR(mTransform)
NS_IMPL_CYCLE_COLLECTION_TRAVERSE_END

NS_IMPL_CYCLE_COLLECTING_ADDREF(DOMSVGMatrix)
NS_IMPL_CYCLE_COLLECTING_RELEASE(DOMSVGMatrix)

} // namespace mozilla
DOMCI_DATA(SVGMatrix, mozilla::DOMSVGMatrix)
namespace mozilla {

NS_INTERFACE_MAP_BEGIN_CYCLE_COLLECTION(DOMSVGMatrix)
  NS_INTERFACE_MAP_ENTRY(mozilla::DOMSVGMatrix) // pseudo-interface
  NS_INTERFACE_MAP_ENTRY(nsIDOMSVGMatrix)
  NS_INTERFACE_MAP_ENTRY(nsISupports)
  NS_DOM_INTERFACE_MAP_ENTRY_CLASSINFO(SVGMatrix)
NS_INTERFACE_MAP_END

//----------------------------------------------------------------------
// nsIDOMSVGMatrix methods:

/* attribute float a; */
NS_IMETHODIMP DOMSVGMatrix::GetA(float *aA)
{
  *aA = static_cast<float>(Matrix().xx);
  return NS_OK;
}
NS_IMETHODIMP DOMSVGMatrix::SetA(float aA)
{
  if (IsAnimVal()) {
    return NS_ERROR_DOM_NO_MODIFICATION_ALLOWED_ERR;
  }
  NS_ENSURE_FINITE(aA, NS_ERROR_ILLEGAL_VALUE);

  gfxMatrix mx = Matrix();
  mx.xx = aA;
  SetMatrix(mx);
  return NS_OK;
}

/* attribute float b; */
NS_IMETHODIMP DOMSVGMatrix::GetB(float *aB)
{
  *aB = static_cast<float>(Matrix().yx);
  return NS_OK;
}
NS_IMETHODIMP DOMSVGMatrix::SetB(float aB)
{
  if (IsAnimVal()) {
    return NS_ERROR_DOM_NO_MODIFICATION_ALLOWED_ERR;
  }
  NS_ENSURE_FINITE(aB, NS_ERROR_ILLEGAL_VALUE);

  gfxMatrix mx = Matrix();
  mx.yx = aB;
  SetMatrix(mx);
  return NS_OK;
}

/* attribute float c; */
NS_IMETHODIMP DOMSVGMatrix::GetC(float *aC)
{
  *aC = static_cast<float>(Matrix().xy);
  return NS_OK;
}
NS_IMETHODIMP DOMSVGMatrix::SetC(float aC)
{
  if (IsAnimVal()) {
    return NS_ERROR_DOM_NO_MODIFICATION_ALLOWED_ERR;
  }
  NS_ENSURE_FINITE(aC, NS_ERROR_ILLEGAL_VALUE);

  gfxMatrix mx = Matrix();
  mx.xy = aC;
  SetMatrix(mx);
  return NS_OK;
}

/* attribute float d; */
NS_IMETHODIMP DOMSVGMatrix::GetD(float *aD)
{
  *aD = static_cast<float>(Matrix().yy);
  return NS_OK;
}
NS_IMETHODIMP DOMSVGMatrix::SetD(float aD)
{
  if (IsAnimVal()) {
    return NS_ERROR_DOM_NO_MODIFICATION_ALLOWED_ERR;
  }
  NS_ENSURE_FINITE(aD, NS_ERROR_ILLEGAL_VALUE);

  gfxMatrix mx = Matrix();
  mx.yy = aD;
  SetMatrix(mx);
  return NS_OK;
}

/* attribute float e; */
NS_IMETHODIMP DOMSVGMatrix::GetE(float *aE)
{
  *aE = static_cast<float>(Matrix().x0);
  return NS_OK;
}
NS_IMETHODIMP DOMSVGMatrix::SetE(float aE)
{
  if (IsAnimVal()) {
    return NS_ERROR_DOM_NO_MODIFICATION_ALLOWED_ERR;
  }
  NS_ENSURE_FINITE(aE, NS_ERROR_ILLEGAL_VALUE);

  gfxMatrix mx = Matrix();
  mx.x0 = aE;
  SetMatrix(mx);
  return NS_OK;
}

/* attribute float f; */
NS_IMETHODIMP DOMSVGMatrix::GetF(float *aF)
{
  *aF = static_cast<float>(Matrix().y0);
  return NS_OK;
}
NS_IMETHODIMP DOMSVGMatrix::SetF(float aF)
{
  if (IsAnimVal()) {
    return NS_ERROR_DOM_NO_MODIFICATION_ALLOWED_ERR;
  }
  NS_ENSURE_FINITE(aF, NS_ERROR_ILLEGAL_VALUE);

  gfxMatrix mx = Matrix();
  mx.y0 = aF;
  SetMatrix(mx);
  return NS_OK;
}

/* nsIDOMSVGMatrix multiply (in nsIDOMSVGMatrix secondMatrix); */
NS_IMETHODIMP DOMSVGMatrix::Multiply(nsIDOMSVGMatrix *secondMatrix,
                                     nsIDOMSVGMatrix **_retval)
{
  *_retval = nsnull;
  nsCOMPtr<DOMSVGMatrix> domMatrix = do_QueryInterface(secondMatrix);
  if (!domMatrix)
    return NS_ERROR_DOM_SVG_WRONG_TYPE_ERR;

  NS_ADDREF(*_retval = new DOMSVGMatrix(domMatrix->Matrix() * Matrix()));
  return NS_OK;
}

/* nsIDOMSVGMatrix inverse (); */
NS_IMETHODIMP DOMSVGMatrix::Inverse(nsIDOMSVGMatrix **_retval)
{
  *_retval = nsnull;
  if (Matrix().IsSingular())
    return NS_ERROR_DOM_SVG_MATRIX_NOT_INVERTABLE;

  NS_ADDREF(*_retval = new DOMSVGMatrix(gfxMatrix(Matrix()).Invert()));
  return NS_OK;
}

/* nsIDOMSVGMatrix translate (in float x, in float y); */
NS_IMETHODIMP DOMSVGMatrix::Translate(float x, float y,
                                      nsIDOMSVGMatrix **_retval)
{
  *_retval = nsnull;
  NS_ENSURE_FINITE2(x, y, NS_ERROR_ILLEGAL_VALUE);

  NS_ADDREF(*_retval =
    new DOMSVGMatrix(gfxMatrix(Matrix()).Translate(gfxPoint(x, y))));
  return NS_OK;
}

/* nsIDOMSVGMatrix scale (in float scaleFactor); */
NS_IMETHODIMP DOMSVGMatrix::Scale(float scaleFactor, nsIDOMSVGMatrix **_retval)
{
  return ScaleNonUniform(scaleFactor, scaleFactor, _retval);
}

/* nsIDOMSVGMatrix scaleNonUniform (in float scaleFactorX,
 *                                  in float scaleFactorY); */
NS_IMETHODIMP DOMSVGMatrix::ScaleNonUniform(float scaleFactorX,
                                            float scaleFactorY,
                                            nsIDOMSVGMatrix **_retval)
{
  *_retval = nsnull;
  NS_ENSURE_FINITE2(scaleFactorX, scaleFactorY, NS_ERROR_ILLEGAL_VALUE);

  NS_ADDREF(*_retval =
    new DOMSVGMatrix(gfxMatrix(Matrix()).Scale(scaleFactorX, scaleFactorY)));
  return NS_OK;
}

/* nsIDOMSVGMatrix rotate (in float angle); */
NS_IMETHODIMP DOMSVGMatrix::Rotate(float angle, nsIDOMSVGMatrix **_retval)
{
  *_retval = nsnull;
  NS_ENSURE_FINITE(angle, NS_ERROR_ILLEGAL_VALUE);

  NS_ADDREF(*_retval =
    new DOMSVGMatrix(gfxMatrix(Matrix()).Rotate(angle*radPerDegree)));
  return NS_OK;
}

/* nsIDOMSVGMatrix rotateFromVector (in float x, in float y); */
NS_IMETHODIMP DOMSVGMatrix::RotateFromVector(float x, float y,
                                             nsIDOMSVGMatrix **_retval)
{
  *_retval = nsnull;
  NS_ENSURE_FINITE2(x, y, NS_ERROR_ILLEGAL_VALUE);

  if (x == 0.0 || y == 0.0)
    return NS_ERROR_DOM_SVG_INVALID_VALUE_ERR;

  NS_ADDREF(*_retval =
    new DOMSVGMatrix(gfxMatrix(Matrix()).Rotate(atan2(y, x))));
  return NS_OK;
}

/* nsIDOMSVGMatrix flipX (); */
NS_IMETHODIMP DOMSVGMatrix::FlipX(nsIDOMSVGMatrix **_retval)
{
  const gfxMatrix& mx = Matrix();
  NS_ADDREF(*_retval = new DOMSVGMatrix(gfxMatrix(-mx.xx, -mx.yx,
                                                  mx.xy, mx.yy,
                                                  mx.x0, mx.y0)));
  return NS_OK;
}

/* nsIDOMSVGMatrix flipY (); */
NS_IMETHODIMP DOMSVGMatrix::FlipY(nsIDOMSVGMatrix **_retval)
{
  const gfxMatrix& mx = Matrix();
  NS_ADDREF(*_retval = new DOMSVGMatrix(gfxMatrix(mx.xx, mx.yx,
                                                  -mx.xy, -mx.yy,
                                                  mx.x0, mx.y0)));
  return NS_OK;
}

/* nsIDOMSVGMatrix skewX (in float angle); */
NS_IMETHODIMP DOMSVGMatrix::SkewX(float angle, nsIDOMSVGMatrix **_retval)
{
  *_retval = nsnull;
  NS_ENSURE_FINITE(angle, NS_ERROR_ILLEGAL_VALUE);

  double ta = tan( angle*radPerDegree );
  NS_ENSURE_FINITE(ta, NS_ERROR_DOM_SVG_INVALID_VALUE_ERR);

  const gfxMatrix& mx = Matrix();
  gfxMatrix skewMx(mx.xx, mx.yx,
                   (float) (mx.xy + mx.xx*ta), (float) (mx.yy + mx.yx*ta),
                   mx.x0, mx.y0);
  NS_ADDREF(*_retval = new DOMSVGMatrix(skewMx));
  return NS_OK;
}

/* nsIDOMSVGMatrix skewY (in float angle); */
NS_IMETHODIMP DOMSVGMatrix::SkewY(float angle, nsIDOMSVGMatrix **_retval)
{
  *_retval = nsnull;
  NS_ENSURE_FINITE(angle, NS_ERROR_ILLEGAL_VALUE);

  double ta = tan( angle*radPerDegree );
  NS_ENSURE_FINITE(ta, NS_ERROR_DOM_SVG_INVALID_VALUE_ERR);

  const gfxMatrix& mx = Matrix();
  gfxMatrix skewMx((float) (mx.xx + mx.xy*ta), (float) (mx.yx + mx.yy*ta),
                   mx.xy, mx.yy,
                   mx.x0, mx.y0);
  NS_ADDREF(*_retval = new DOMSVGMatrix(skewMx));
  return NS_OK;
}

} // namespace mozilla
