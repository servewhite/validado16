import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const INVICTUS_API_BASE_URL = "https://api.invictuspay.com.br/api/public/v1"

export async function GET() {
  const apiToken = process.env.INVICTUS_PAY_API_TOKEN
  const offerHash = process.env.INVICTUS_PAY_OFFER_HASH

  // Check environment variables
  if (!apiToken) {
    return NextResponse.json({
      success: false,
      error: "INVICTUS_PAY_API_TOKEN não configurado",
      hasToken: false,
      hasOfferHash: !!offerHash,
    })
  }

  if (!offerHash) {
    return NextResponse.json({
      success: false,
      error: "INVICTUS_PAY_OFFER_HASH não configurado",
      hasToken: true,
      hasOfferHash: false,
    })
  }

  // Test API connection - try to list transactions
  try {
    const url = `${INVICTUS_API_BASE_URL}/transactions?api_token=${apiToken}&limit=1`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "InvictusPay-Integration/1.0",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const text = await response.text()
    let data: unknown

    try {
      data = JSON.parse(text)
    } catch {
      return NextResponse.json({
        success: false,
        error: "Resposta não é JSON",
        status: response.status,
        response: text.substring(0, 500),
        hasToken: true,
        hasOfferHash: true,
      })
    }

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      hasToken: true,
      hasOfferHash: true,
      tokenPreview: `${apiToken.substring(0, 5)}...${apiToken.substring(apiToken.length - 5)}`,
      offerHash: offerHash,
      apiResponse: data,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido"
    const isTimeout = errorMessage.includes("abort")

    return NextResponse.json({
      success: false,
      error: isTimeout ? "Timeout - API demorou mais de 10 segundos" : errorMessage,
      errorType: error instanceof Error ? error.name : "Unknown",
      hasToken: true,
      hasOfferHash: true,
    })
  }
}
