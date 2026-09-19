import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { ScreenItem } from '../types'
import { Screen } from './Screen'

const item = (id: string, domain: ScreenItem['domain'], text_en: string, text_es: string): ScreenItem => ({
  id, population: 'adult', construct_id: 'x', domain, text_en, text_es,
  low_en: 'Bad', high_en: 'Good', low_es: 'Mal', high_es: 'Bien', sort_order: 1, active: true,
})
const items = [item('a', 'facial', 'Your nose?', '¿Su nariz?'), item('b', 'function', 'Breathing?', '¿Respirar?')]

describe('Screen', () => {
  it('requires every item before submitting, then submits the scores', () => {
    const onSubmit = vi.fn()
    render(
      <I18nProvider initial="en">
        <Screen screen={{ items, done: false, scores: null }} language="en" onSubmit={onSubmit} busy={false} />
      </I18nProvider>,
    )
    expect(screen.getByText('0 of 2 answered')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()

    const nose = screen.getByRole('radiogroup', { name: 'Your nose?' })
    fireEvent.click(nose.querySelector('button:nth-child(4)')!) // 3
    const breathing = screen.getByRole('radiogroup', { name: 'Breathing?' })
    fireEvent.click(breathing.querySelector('button:nth-child(10)')!) // 9
    expect(screen.getByText('2 of 2 answered')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onSubmit).toHaveBeenCalledWith({ a: 3, b: 9 })
  })

  it('renders Spanish item text and labels', () => {
    render(
      <I18nProvider initial="es">
        <Screen screen={{ items, done: false, scores: null }} language="es" onSubmit={() => {}} busy={false} />
      </I18nProvider>,
    )
    expect(screen.getByText('¿Su nariz?')).toBeTruthy()
    expect(screen.getAllByText('Mal').length).toBe(2)
  })
})
