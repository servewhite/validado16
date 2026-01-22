// Invictus Pay API Integration
// Documentação: https://api.invictuspay.com.br

const INVICTUS_API_BASE_URL = "https://api.invictuspay.com.br/api/public/v1"

// Interfaces
export interface InvictusCustomer {
  name: string
  email: string
  phone_number: string
  document: string // CPF
  street_name?: string
  number?: string
  complement?: string
  neighborhood?: string
  city?: string
  state?: string
  zip_code?: string
}

export interface InvictusCartItem {
  product_hash: string
  title: string
  cover?: string | null
  price: number // em centavos
  quantity: number
  operation_type: number
  tangible: boolean
}

export interface InvictusTracking {
  src?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}

export interface InvictusCard {
  number: string
  holder_name: string
  exp_month: number
  exp_year: number
  cvv: string
}

export interface InvictusCreateTransactionRequest {
  amount: number // em centavos
  offer_hash: string
  payment_method: "pix" | "credit_card" | "billet"
  customer: InvictusCustomer
  cart: InvictusCartItem[]
  card?: InvictusCard
  installments?: number
  expire_in_days?: number
  transaction_origin?: string
  tracking?: InvictusTracking
  postback_url?: string
}

export interface InvictusPixData {
  qr_code?: string
  qr_code_base64?: string
  pix_key?: string
  expires_at?: string
}

export interface InvictusTransaction {
  hash: string
  status: "pending" | "paid" | "canceled" | "refunded"
  amount: number
  payment_method: string
  pix?: InvictusPixData
  created_at: string
  paid_at?: string | null
  customer?: InvictusCustomer
}

export interface InvictusCreateTransactionResponse {
  success: boolean
  data?: InvictusTransaction
  message?: string
  errors?: Record<string, string[]>
}

export interface InvictusGetTransactionResponse {
  success: boolean
  data?: InvictusTransaction
  message?: string
}

export interface InvictusWebhookPayload {
  transaction_hash: string
  status: "pending" | "paid" | "canceled" | "refunded"
  amount: number
  payment_method: string
  paid_at?: string | null
}

// Função para obter o token da API
function getApiToken(): string {
  const token = process.env.INVICTUS_PAY_API_TOKEN
  if (!token) {
    throw new Error("INVICTUS_PAY_API_TOKEN não configurado")
  }
  return token
}

// Função para obter o offer_hash padrão
function getOfferHash(): string {
  const hash = process.env.INVICTUS_PAY_OFFER_HASH
  if (!hash) {
    throw new Error("INVICTUS_PAY_OFFER_HASH não configurado")
  }
  return hash
}

// Função para criar uma transação PIX
export async function createPixTransaction(
  customer: {
    name: string
    email: string
    phone: string
    cpf: string
    address?: {
      street?: string
      number?: string
      complement?: string
      neighborhood?: string
      city?: string
      state?: string
      cep?: string
    }
  },
  items: Array<{
    id: string
    name: string
    price: number // em reais
    quantity: number
  }>,
  totalInCents: number,
  tracking?: InvictusTracking,
  postbackUrl?: string
): Promise<InvictusCreateTransactionResponse> {
  const apiToken = getApiToken()
  const offerHash = getOfferHash()

  const requestBody: InvictusCreateTransactionRequest = {
    amount: totalInCents,
    offer_hash: offerHash,
    payment_method: "pix",
    customer: {
      name: customer.name,
      email: customer.email,
      phone_number: customer.phone.replace(/\D/g, ""),
      document: customer.cpf.replace(/\D/g, ""),
      street_name: customer.address?.street,
      number: customer.address?.number,
      complement: customer.address?.complement,
      neighborhood: customer.address?.neighborhood,
      city: customer.address?.city,
      state: customer.address?.state,
      zip_code: customer.address?.cep?.replace(/\D/g, ""),
    },
    cart: items.map((item) => ({
      product_hash: item.id,
      title: item.name,
      cover: null,
      price: Math.round(item.price * 100), // converter para centavos
      quantity: item.quantity,
      operation_type: 1,
      tangible: true,
    })),
    expire_in_days: 1,
    transaction_origin: "api",
    tracking: tracking,
    postback_url: postbackUrl,
  }

  console.log("[Invictus Pay] Criando transação PIX:", JSON.stringify(requestBody, null, 2))

  const url = `${INVICTUS_API_BASE_URL}/transactions?api_token=${apiToken}`
  console.log("[Invictus Pay] URL:", url.replace(apiToken, "***"))

  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    })
  } catch (fetchError) {
    console.error("[Invictus Pay] Erro de conexão:", fetchError)
    return {
      success: false,
      message: `Erro de conexão com a API: ${fetchError instanceof Error ? fetchError.message : "fetch failed"}`,
    }
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    const text = await response.text()
    console.error("[Invictus Pay] Resposta não é JSON:", text)
    return {
      success: false,
      message: `Resposta inválida da API: ${text.substring(0, 100)}`,
    }
  }

  console.log("[Invictus Pay] Resposta:", JSON.stringify(data, null, 2))

  if (!response.ok) {
    console.error("[Invictus Pay] Erro na API:", data)
    return {
      success: false,
      message: data.message || "Erro ao criar transação",
      errors: data.errors,
    }
  }

  return {
    success: true,
    data: data.data || data,
  }
}

// Função para consultar status de uma transação
export async function getTransactionStatus(transactionHash: string): Promise<InvictusGetTransactionResponse> {
  const apiToken = getApiToken()

  console.log("[Invictus Pay] Consultando transação:", transactionHash)

  const response = await fetch(`${INVICTUS_API_BASE_URL}/transactions/${transactionHash}?api_token=${apiToken}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  })

  const data = await response.json()

  console.log("[Invictus Pay] Status da transação:", JSON.stringify(data, null, 2))

  if (!response.ok) {
    console.error("[Invictus Pay] Erro ao consultar transação:", data)
    return {
      success: false,
      message: data.message || "Erro ao consultar transação",
    }
  }

  return {
    success: true,
    data: data.data || data,
  }
}

// Função para listar transações
export async function listTransactions(
  page: number = 1,
  limit: number = 15,
  status?: string
): Promise<{ success: boolean; data?: InvictusTransaction[]; message?: string }> {
  const apiToken = getApiToken()

  let url = `${INVICTUS_API_BASE_URL}/transactions?api_token=${apiToken}&page=${page}&limit=${limit}`

  if (status) {
    url += `&status=${status}`
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  })

  const data = await response.json()

  if (!response.ok) {
    return {
      success: false,
      message: data.message || "Erro ao listar transações",
    }
  }

  return {
    success: true,
    data: data.data || data,
  }
}

// Mapear status da Invictus Pay para status interno
export function mapInvictusStatus(status: string): "pending" | "paid" | "canceled" | "refunded" {
  switch (status) {
    case "paid":
    case "approved":
      return "paid"
    case "canceled":
    case "cancelled":
    case "refused":
      return "canceled"
    case "refunded":
      return "refunded"
    case "pending":
    case "waiting_payment":
    default:
      return "pending"
  }
}

// Mapear status para UTMify
export function mapInvictusStatusToUtmfy(
  status: string
): "waiting_payment" | "paid" | "refused" | "refunded" | "chargedback" {
  switch (status) {
    case "paid":
    case "approved":
      return "paid"
    case "canceled":
    case "cancelled":
    case "refused":
      return "refused"
    case "refunded":
      return "refunded"
    case "chargeback":
      return "chargedback"
    case "pending":
    case "waiting_payment":
    default:
      return "waiting_payment"
  }
}
