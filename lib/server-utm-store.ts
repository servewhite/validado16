// Armazenamento temporário de UTMs e dados do pedido no servidor
// Usado para persistir dados entre a criação do pedido e o webhook de pagamento

export interface StoredUtmParams {
  src?: string | null
  sck?: string | null
  utm_source?: string | null
  utm_campaign?: string | null
  utm_medium?: string | null
  utm_content?: string | null
  utm_term?: string | null
}

export interface StoredCustomer {
  name: string
  email: string
  phone: string | null
  document: string | null
  country?: string
}

export interface StoredProduct {
  id: string
  name: string
  planId: string | null
  planName: string | null
  quantity: number
  priceInCents: number
}

export interface StoredOrderData {
  params: StoredUtmParams
  customer: StoredCustomer
  products: StoredProduct[]
  totalInCents: number
  createdAt: number
}

// Map para armazenar dados por transactionHash
const orderStore = new Map<string, StoredOrderData>()

// Tempo de expiração: 24 horas (em milissegundos)
const EXPIRATION_TIME = 24 * 60 * 60 * 1000

// Salva os dados do pedido associados ao transactionHash
export function saveOrderData(
  transactionHash: string,
  params: StoredUtmParams,
  customer: StoredCustomer,
  products: StoredProduct[],
  totalInCents: number
): void {
  orderStore.set(transactionHash, {
    params,
    customer,
    products,
    totalInCents,
    createdAt: Date.now(),
  })
  console.log(`[Order Store] Salvou dados para transactionHash: ${transactionHash}`)
  console.log(`[Order Store] Customer: ${customer.name} (${customer.email})`)
  console.log(`[Order Store] Products: ${products.length} items`)
  console.log(`[Order Store] UTMs:`, params)
}

// Recupera os dados do pedido pelo transactionHash
export function getOrderData(transactionHash: string): StoredOrderData | null {
  const entry = orderStore.get(transactionHash)

  if (!entry) {
    console.log(`[Order Store] Nenhum dado encontrado para transactionHash: ${transactionHash}`)
    return null
  }

  // Verifica se expirou
  if (Date.now() - entry.createdAt > EXPIRATION_TIME) {
    orderStore.delete(transactionHash)
    console.log(`[Order Store] Dados expirados para transactionHash: ${transactionHash}`)
    return null
  }

  console.log(`[Order Store] Recuperou dados para transactionHash: ${transactionHash}`)
  return entry
}

// Recupera apenas os parâmetros UTM (compatibilidade)
export function getUtmParams(transactionHash: string): StoredUtmParams | null {
  const entry = getOrderData(transactionHash)
  return entry?.params || null
}

// Função legada para manter compatibilidade
export function saveUtmParams(orderId: string, params: StoredUtmParams): void {
  // Não faz nada - use saveOrderData ao invés
  console.log(`[Order Store] saveUtmParams chamado para ${orderId} - use saveOrderData ao invés`)
}

// Remove os dados após uso (opcional, para limpeza)
export function deleteOrderData(transactionHash: string): void {
  orderStore.delete(transactionHash)
  console.log(`[Order Store] Removeu dados para transactionHash: ${transactionHash}`)
}

// Limpeza automática de entradas expiradas (executa a cada 30 minutos)
setInterval(
  () => {
    const now = Date.now()
    let cleanedCount = 0

    for (const [hash, entry] of orderStore.entries()) {
      if (now - entry.createdAt > EXPIRATION_TIME) {
        orderStore.delete(hash)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      console.log(`[Order Store] Limpeza automática: removeu ${cleanedCount} entradas expiradas`)
    }
  },
  30 * 60 * 1000 // 30 minutos
)
