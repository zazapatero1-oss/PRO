import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import type { ConstructDef, ConstructMapRow } from '../types'
import { NewSessionForm } from './ParticipantPage'

const startSession = vi.fn()
vi.mock('../api', () => ({ api: { startSession: (...a: unknown[]) => startSession(...a) } }))

const construct = (id: string, label: string, extra: Partial<ConstructDef> = {}): ConstructDef =>
  ({ id, label, description: '', severity_signals: { none: '', mild: '', moderate: '', severe: '' }, drill_down: [], priority: 'core', ...extra }) as ConstructDef

const map: ConstructMapRow = {
  id: 'm1', slug: 'face-q-adult', version: 2, population: 'adult', status: 'approved',
  map: {
    slug: 'face-q-adult', version: 2, population: 'adult', language: 'en',
    domains: [
      { id: 'appearance', label: 'Facial appearance', weight: 1, constructs: [construct('appearance.nose', 'Nose'), construct('appearance.eyes', 'Eyes')] },
      { id: 'function', label: 'Facial function', weight: 1, constructs: [construct('function.breathing', 'Breathing')] },
      { id: 'outcome', label: 'Outcome', weight: 1, constructs: [construct('outcome.result', 'Result', { applicable_timepoints: ['post-op-6w'] })] },
    ],
  },
} as unknown as ConstructMapRow

const renderForm = () =>
  render(
    <MemoryRouter>
      <I18nProvider initial="en">
        <NewSessionForm participant={null} maps={[map]} onCreated={() => {}} />
      </I18nProvider>
    </MemoryRouter>,
  )

describe('NewSessionForm — domains of interest', () => {
  beforeEach(() => {
    startSession.mockReset()
    startSession.mockResolvedValue({ session_id: 's', participant_id: 'p', study_id: 'P-1', resume_token: 't', patient_link_path: '/p/t' })
  })

  it('offers domains (not individual constructs) and sends the chosen domain ids', async () => {
    renderForm()
    expect(screen.getByText('Facial appearance')).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /^Nose$/ })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: /display name/i }), { target: { value: 'Sam' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Facial function/ }))
    expect(screen.getByText('1 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /create session/i }))
    await waitFor(() => expect(startSession).toHaveBeenCalledTimes(1))
    expect(startSession.mock.calls[0][0].clinician_note).toEqual({ note: '', focus_constructs: [], focus_domains: ['function'] })
  })

  it('hides domains that do not apply at the chosen timepoint and drops them from the selection', async () => {
    renderForm()
    expect(screen.queryByText('Outcome')).toBeNull() // baseline
    fireEvent.change(screen.getByRole('combobox', { name: /timepoint/i }), { target: { value: 'post-op-6w' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Outcome/ }))
    fireEvent.change(screen.getByRole('combobox', { name: /timepoint/i }), { target: { value: 'baseline' } })
    fireEvent.change(screen.getByRole('textbox', { name: /display name/i }), { target: { value: 'Sam' } })
    fireEvent.click(screen.getByRole('button', { name: /create session/i }))
    await waitFor(() => expect(startSession).toHaveBeenCalledTimes(1))
    expect(startSession.mock.calls[0][0].clinician_note).toBeUndefined()
  })
})
