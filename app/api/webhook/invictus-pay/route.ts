import { type NextRequest, NextResponse } from "next/server"
import { sendOrderToUtmfy, formatUtmfyDate, type UtmfyOrderRequest } from "@/lib/utmfy"
import { getOrderData } from "@/lib/server-utm-store"
import { mapInvictusStatusToUtmfy, type InvictusWebhookPayload } from "@/lib/invictus-pay"

export async function POST(request: NextRequest) {
  try {
    const body: InvictusWebhookPayload = await request.json()

    console.log("===========================================")
    console.log("[Invictus Webhook] WEBHOOK RECEBIDO")
    console.log("===========================================")
    console.log("[Invictus Webhook] Payload:", JSON.stringify(body))

    const { transaction_hash, status, amount, payment_method, paid_at } = body

    if (!transaction_hash || !status) {
      console.error("[Invictus Webhook] Dados incompletos - transaction_hash ou status ausente")
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 })
    }

    // Mapear status para UTMify
    const utmfyStatus = mapInvictusStatusToUtmfy(status)

    console.log(`[Invictus Webhook] Transação: ${transaction_hash}`)
    console.log(`[Invictus Webhook] Status Invictus: ${status} -> Status UTMify: ${utmfyStatus}`)

    // Recuperar dados completos do pedido salvos anteriormente
    const orderData = getOrderData(transaction_hash)
    
    if (!orderData) {
      console.error(`[Invictus Webhook] ERRO: Dados do pedido não encontrados para hash: ${transaction_hash}`)
      console.log("[Invictus Webhook] Isso pode acontecer se o servidor foi reiniciado ou os dados expiraram")
      
      // Mesmo sem os dados salvos, tenta enviar com dados mínimos
      // para não perder a atualização de status
    }

    console.log("[Invictus Webhook] Dados do pedido recuperados:", orderData ? "SIM" : "NAO")
    if (orderData) {
      console.log("[Invictus Webhook] Customer:", orderData.customer.name, orderData.customer.email)
      console.log("[Invictus Webhook] UTM Campaign:", orderData.params.utm_campaign)
      console.log("[Invictus Webhook] Products:", orderData.products.length)
    }

    // Preparar dados para enviar ao UTMify
    const utmfyOrder: UtmfyOrderRequest = {
      orderId: transaction_hash,
      platform: "papelaria-site",
      paymentMethod: payment_method === "credit_card" ? "credit_card" : 
                     payment_method === "billet" ? "boleto" : "pix",
      status: utmfyStatus,
      createdAt: formatUtmfyDate(new Date(orderData?.createdAt || Date.now())) || "",
      approvedDate: utmfyStatus === "paid" && paid_at ? formatUtmfyDate(new Date(paid_at)) : 
                    utmfyStatus === "paid" ? formatUtmfyDate(new Date()) : null,
      refundedAt: utmfyStatus === "refunded" ? formatUtmfyDate(new Date()) : null,
      customer: orderData?.customer || {
        name: "Cliente",
        email: "cliente@email.com",
        phone: null,
        document: null,
        country: "BR",
      },
      products: orderData?.products || [
        {
          id: "product",
          name: "Produto",
          planId: null,
          planName: null,
          quantity: 1,
          priceInCents: amount || 0,
        },
      ],
      trackingParameters: orderData?.params || {
        src: null,
        sck: null,
        utm_source: null,
        utm_campaign: null,
        utm_medium: null,
        utm_content: null,
        utm_term: null,
      },
      commission: {
        totalPriceInCents: orderData?.totalInCents || amount || 0,
        gatewayFeeInCents: 0,
        userCommissionInCents: orderData?.totalInCents || amount || 0,
        currency: "BRL",
      },
    }

    console.log("===========================================")
    console.log(`[Invictus Webhook] Enviando para UTMify - Status: ${utmfyStatus}`)
    console.log("===========================================")
    console.log("[Invictus Webhook] UTMify Order:", JSON.stringify(utmfyOrder, null, 2))

    try {
      const utmfyResult = await sendOrderToUtmfy(utmfyOrder)
      
      console.log("[Invictus Webhook] Resultado UTMify:", utmfyResult)
      
      if (utmfyResult.success) {
        console.log("===========================================")
        console.log(`[Invictus Webhook] SUCESSO! Venda ${utmfyStatus === "paid" ? "APROVADA" : utmfyStatus.toUpperCase()} enviada para UTMify`)
        console.log(`[Invictus Webhook] Order ID: ${transaction_hash}`)
        console.log(`[Invictus Webhook] Campaign: ${orderData?.params.utm_campaign || "N/A"}`)
        console.log("===========================================")
      } else {
        console.error("[Invictus Webhook] ERRO ao enviar para UTMify:", utmfyResult.error)
      }
    } catch (utmfyError) {
      console.error("[Invictus Webhook] Exceção ao enviar para UTMify:", utmfyError)
    }

    return NextResponse.json({
      success: true,
      message: "Webhook processado com sucesso",
      transactionHash: transaction_hash,
      status: utmfyStatus,
      orderDataFound: !!orderData,
    })
  } catch (error) {
    console.error("[Invictus Webhook] Erro geral:", error)
    return NextResponse.json({ error: "Erro interno ao processar webhook" }, { status: 500 })
  }
}

// Invictus Pay pode enviar GET para verificar se o webhook está ativo
export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Invictus Pay webhook endpoint ativo",
    timestamp: new Date().toISOString(),
  })
}
