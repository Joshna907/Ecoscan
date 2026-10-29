import type { ClothingCategory } from 'shared'
export const labels: Record<ClothingCategory, string> = { tshirt: 'T-shirt', jeans: 'Jeans', jacket: 'Jacket', shoes: 'Shoes' }
export const kg = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value)
