import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SummaryReview } from './SummaryReview'

describe('SummaryReview', () => {
  it('shows the summary, collects multiple corrections and submits them', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(
      <I18nProvider initial="en">
        <SummaryReview summary="Here is what I heard" onConfirm={onConfirm} />
      </I18nProvider>,
    )
    expect(screen.getByText('Here is what I heard')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "That's right, finish" })).toBeEnabled()

    const box = screen.getByLabelText('Correct anything')
    fireEvent.change(box, { target: { value: 'It is my chin' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add correction' }))
    fireEvent.change(box, { target: { value: 'Breathing is fine now' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add correction' }))
    expect(screen.getByText('It is my chin')).toBeInTheDocument()
    expect(screen.getByText('Breathing is fine now')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Send corrections and finish' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onConfirm).toHaveBeenCalledWith([
      { construct_id: null, patient_text: 'It is my chin' },
      { construct_id: null, patient_text: 'Breathing is fine now' },
    ])
  })
})
