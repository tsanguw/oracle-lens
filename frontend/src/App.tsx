import { Route, Routes } from 'react-router-dom'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<p>[Site name]</p>} />
      <Route path="/players/:name" element={<p>Player page</p>} />
    </Routes>
  )
}
