import type { Language } from '../types'
import en from './en.json'
import es from './es.json'

type Dict = { [key: string]: string | string[] | Dict }
const DICTS: Record<Language, Dict> = { en: en as Dict, es: es as Dict }

// Both v1 languages are LTR; the dir attribute is still driven from here so an RTL language
// only needs an entry in this table.
export const DIR: Record<Language, 'ltr' | 'rtl'> = { en: 'ltr', es: 'ltr' }

export type Vars = Record<string, string | number>

function lookup(dict: Dict, key: string): string | string[] | undefined {
  let cur: string | string[] | Dict | undefined = dict
  for (const part of key.split('.')) {
    if (cur === undefined || typeof cur === 'string' || Array.isArray(cur)) return undefined
    cur = cur[part]
  }
  return typeof cur === 'string' || Array.isArray(cur) ? cur : undefined
}

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** Pure translation function; falls back to English, then to the key itself. */
export function translate(lang: Language, key: string, vars?: Vars): string {
  const v = lookup(DICTS[lang], key) ?? lookup(DICTS.en, key)
  if (v === undefined) return key
  return interpolate(Array.isArray(v) ? v.join('\n') : v, vars)
}

export function translateList(lang: Language, key: string): string[] {
  const v = lookup(DICTS[lang], key) ?? lookup(DICTS.en, key)
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

export function isLanguage(x: unknown): x is Language {
  return x === 'en' || x === 'es'
}

