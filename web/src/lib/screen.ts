import type { Language, ScreenItem } from '../types'

export function itemText(item: ScreenItem, lang: Language) {
  return lang === 'es'
    ? { text: item.text_es, low: item.low_es, high: item.high_es }
    : { text: item.text_en, low: item.low_en, high: item.high_en }
}
