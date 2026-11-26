import { Navigate, Outlet, Route, Routes, useParams } from 'react-router';
import Header from './components/Header';
import { tutors } from './data/tutors';
import TutorPickerPage from './pages/TutorPickerPage';
import LevelPickerPage from './pages/LevelPickerPage';
import LessonPage from './pages/LessonPage';

function TutorRoute() {
  const { tutorId } = useParams();
  const tutor = tutors.find((candidate) => candidate.id === tutorId);
  if (!tutor) return <Navigate to="/" replace />;

  return <Outlet key={tutor.id} context={tutor} />;
}

export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <Routes>
        <Route path="/" element={<TutorPickerPage />} />
        <Route path="/tutors/:tutorId" element={<TutorRoute />}>
          <Route index element={<Navigate to="level" replace />} />
          <Route path="level" element={<LevelPickerPage />} />
          <Route path="lesson" element={<LessonPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
