import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider, useT } from './index'
import { translate, translateList } from './translate'

describe('translate', () => {
  it('returns the string for the active language with interpolation', () => {
    expect(translate('en', 'patient.chat.coverage', { covered: 6, total: 9 })).toBe("We've talked about 6 of 9 areas")
    expect(translate('es', 'patient.chat.coverage', { covered: 6, total: 9 })).toBe('Hemos hablado de 6 de 9 temas')
  })

  it('falls back to English, then to the key', () => {
    expect(translate('es', 'common.english')).toBe('English')
    expect(translate('es', 'does.not.exist')).toBe('does.not.exist')
  })

  it('returns arrays for list keys', () => {
    expect(translateList('en', 'patient.consent.adult.body').length).toBeGreaterThan(2)
    expect(translateList('es', 'patient.consent.guardian.body')[0]).toMatch(/hijo/)
  })

  it('has every English key present in Spanish', async () => {
    const en = (await import('./en.json')).default as Record<string, unknown>
    const es = (await import('./es.json')).default as Record<string, unknown>
    const keys = (o: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object' && !Array.isArray(v) ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
      )
    const esKeys = new Set(keys(es))
    const enKeys = new Set(keys(en))
    expect(keys(en).filter((k) => !esKeys.has(k))).toEqual([])
    expect(keys(es).filter((k) => !enKeys.has(k))).toEqual([])
  })
})

function Probe() {
  const { t, lang, setLang, dir } = useT()
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="dir">{dir}</span>
      <span data-testid="text">{t('patient.chat.send')}</span>
      <button onClick={() => setLang('es')}>es</button>
    </div>
  )
}

describe('useT', () => {
  it('provides t() and updates <html lang dir> when the language changes', () => {
    render(
      <I18nProvider initial="en">
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('text').textContent).toBe('Send')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
    act(() => screen.getByText('es').click())
    expect(screen.getByTestId('lang').textContent).toBe('es')
    expect(screen.getByTestId('text').textContent).toBe('Enviar')
    expect(document.documentElement.lang).toBe('es')
    expect(document.documentElement.getAttribute('dir')).toBe('ltr')
  })
})
