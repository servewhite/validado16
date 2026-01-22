import { type NextRequest, NextResponse } from "next/server"
import { sendOrderToUtmfy, formatUtmfyDate, type UtmfyOrderRequest } from "@/lib/utmfy"
import { saveOrderData } from "@/lib/server-utm-store"
import { createPixTransaction, type InvictusTracking } from "@/lib/invictus-pay"

// Gera ID único para o pedido
function generateOrderId(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `PED-${timestamp}-${random}`
}

// Converte valor em reais para centavos
function toCents(value: number): number {
  return Math.round(value * 100)
}

export async function POST(request: NextRequest) {
  try {
    // Verificar variáveis de ambiente
    const hasToken = !!process.env.INVICTUS_PAY_API_TOKEN
    const hasOfferHash = !!process.env.INVICTUS_PAY_OFFER_HASH
    console.log("[PIX Create] Variáveis configuradas - Token:", hasToken, "OfferHash:", hasOfferHash)
    
    if (!hasToken) {
      return NextResponse.json({ error: "INVICTUS_PAY_API_TOKEN não configurado" }, { status: 500 })
    }
    if (!hasOfferHash) {
      return NextResponse.json({ error: "INVICTUS_PAY_OFFER_HASH não configurado" }, { status: 500 })
    }
    
    const body = await request.json()
    console.log("[PIX Create] Recebendo requisição:", JSON.stringify(body))

    const { customer, address, items, total, trackingParams } = body

    // Validações básicas
    if (!customer || !customer.name || !customer.email || !customer.cpf || !customer.phone) {
      return NextResponse.json({ error: "Dados do cliente incompletos" }, { status: 400 })
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Nenhum item no pedido" }, { status: 400 })
    }

    if (!total || total <= 0) {
      return NextResponse.json({ error: "Valor total inválido" }, { status: 400 })
    }

    const orderId = generateOrderId()
    const amountInCents = toCents(total)

    // Preparar tracking para Invictus Pay
    const invictusTracking: InvictusTracking = {
      src: trackingParams?.src || "",
      utm_source: trackingParams?.utm_source || "",
      utm_medium: trackingParams?.utm_medium || "",
      utm_campaign: trackingParams?.utm_campaign || "",
      utm_term: trackingParams?.utm_term || "",
      utm_content: trackingParams?.utm_content || "",
    }

    // URL do webhook para receber notificações de pagamento
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    const postbackUrl = baseUrl ? `${baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`}/api/webhook/invictus-pay` : undefined

    // Criar transação PIX na Invictus Pay
    const invictusResponse = await createPixTransaction(
      {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        cpf: customer.cpf,
        address: address ? {
          street: address.street,
          number: address.number,
          complement: address.complement,
          neighborhood: address.neighborhood,
          city: address.city,
          state: address.state,
          cep: address.cep,
        } : undefined,
      },
      items.map((item: { id: string; name: string; price: number; quantity: number }) => ({
        id: item.id || "product",
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      amountInCents,
      invictusTracking,
      postbackUrl
    )

    if (!invictusResponse.success || !invictusResponse.data) {
      console.error("[PIX Create] Erro Invictus Pay:", invictusResponse)
      return NextResponse.json(
        { error: invictusResponse.message || "Erro ao gerar PIX" },
        { status: 500 }
      )
    }

    const transactionData = invictusResponse.data
    const transactionHash = transactionData.hash

    console.log("[PIX Create] Transação criada:", transactionHash)

    // Preparar dados do cliente para salvar
    const customerData = {
      name: customer.name,
      email: customer.email,
      phone: customer.phone?.replace(/\D/g, "") || null,
      document: customer.cpf?.replace(/\D/g, "") || null,
      country: "BR" as const,
    }

    // Preparar produtos para salvar
    const productsData = items.map((item: { id: string; name: string; price: number; quantity: number }) => ({
      id: item.id || "product",
      name: item.name,
      planId: null,
      planName: null,
      quantity: item.quantity,
      priceInCents: toCents(item.price),
    }))

    // Preparar UTMs
    const utmParams = {
      src: trackingParams?.src || null,
      sck: trackingParams?.sck || null,
      utm_source: trackingParams?.utm_source || null,
      utm_campaign: trackingParams?.utm_campaign || null,
      utm_medium: trackingParams?.utm_medium || null,
      utm_content: trackingParams?.utm_content || null,
      utm_term: trackingParams?.utm_term || null,
    }

    // Salvar todos os dados do pedido no servidor usando o transactionHash como chave
    saveOrderData(transactionHash, utmParams, customerData, productsData, amountInCents)
    console.log("[PIX Create] Dados do pedido salvos para transactionHash:", transactionHash)

    // Enviar para UTMify com status waiting_payment (venda pendente)
    try {
      const utmfyOrder: UtmfyOrderRequest = {
        orderId: transactionHash,
        platform: "papelaria-site",
        paymentMethod: "pix",
        status: "waiting_payment",
        createdAt: formatUtmfyDate(new Date()) || "",
        approvedDate: null,
        refundedAt: null,
        customer: customerData,
        products: productsData,
        trackingParameters: utmParams,
        commission: {
          totalPriceInCents: amountInCents,
          gatewayFeeInCents: 0,
          userCommissionInCents: amountInCents,
          currency: "BRL",
        },
      }

      console.log("[PIX Create] Enviando venda PENDENTE para UTMify:", JSON.stringify(utmfyOrder))
      console.log("[PIX Create] UTM Campaign:", utmParams.utm_campaign)
      const utmfyResult = await sendOrderToUtmfy(utmfyOrder)
      console.log("[PIX Create] Resultado UTMify (waiting_payment):", utmfyResult)
      
      if (!utmfyResult.success) {
        console.error("[PIX Create] ERRO ao enviar para UTMify:", utmfyResult.error)
      }
    } catch (utmfyError) {
      console.error("[PIX Create] Erro ao enviar para UTMify:", utmfyError)
    }

    // Extrair dados do PIX da resposta
    const pixData = {
      qrcode: transactionData.pix?.qr_code || transactionData.pix?.pix_key || "",
      qrCodeBase64: transactionData.pix?.qr_code_base64 || "",
      expiresAt: transactionData.pix?.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }

    // Retorna dados do PIX
    return NextResponse.json({
      success: true,
      orderId: orderId,
      transactionId: transactionHash,
      pix: pixData,
    })
  } catch (error) {
    console.error("[PIX Create] Erro:", error)
    const errorMessage = error instanceof Error ? error.message : "Erro interno ao processar pagamento"
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
