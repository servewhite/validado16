import { type NextRequest, NextResponse } from "next/server"
import { getTransactionStatus, mapInvictusStatus } from "@/lib/invictus-pay"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get("transactionId")

    if (!transactionId) {
      return NextResponse.json({ error: "transactionId é obrigatório" }, { status: 400 })
    }

    console.log("[PIX Status] Consultando transação:", transactionId)

    // Consultar status na Invictus Pay
    const response = await getTransactionStatus(transactionId)

    if (!response.success || !response.data) {
      console.error("[PIX Status] Erro ao consultar:", response.message)
      return NextResponse.json({
        success: false,
        transactionId,
        status: "pending",
        paidAt: null,
        error: response.message,
      })
    }

    const transaction = response.data
    const status = mapInvictusStatus(transaction.status)

    console.log("[PIX Status] Status:", status, "Paid at:", transaction.paid_at)

    return NextResponse.json({
      success: true,
      transactionId,
      status: status,
      paidAt: transaction.paid_at || null,
      amount: transaction.amount,
      paymentMethod: transaction.payment_method,
    })
  } catch (error) {
    console.error("[PIX Status] Erro:", error)
    return NextResponse.json({ error: "Erro interno ao consultar status" }, { status: 500 })
  }
}
