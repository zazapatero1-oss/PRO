import { Navigate, Route, Routes } from 'react-router-dom'
import { ClinicianLayout } from './clinician/ClinicianLayout'
import { InstrumentsPage } from './clinician/InstrumentsPage'
import { ParticipantPage } from './clinician/ParticipantPage'
import { ParticipantsList } from './clinician/ParticipantsList'
import { SessionReview } from './clinician/SessionReview'
import { SignIn } from './clinician/SignIn'
import { NotFound } from './components/NotFound'
import { Landing } from './components/Landing'
import { PatientFlow } from './patient/PatientFlow'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/p/:token" element={<PatientFlow />} />
      <Route path="/clinician" element={<ClinicianLayout />}>
        <Route index element={<ParticipantsList />} />
        <Route path="sign-in" element={<SignIn />} />
        <Route path="participant/new" element={<ParticipantPage />} />
        <Route path="participant/:id" element={<ParticipantPage />} />
        <Route path="session/:id" element={<SessionReview />} />
        <Route path="instruments" element={<InstrumentsPage />} />
      </Route>
      <Route path="/index.html" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
