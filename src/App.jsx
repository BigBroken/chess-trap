import { useState } from 'react';
import Home from './screens/Home.jsx';
import Learn from './screens/Learn.jsx';
import Quiz from './screens/Quiz.jsx';

export default function App() {
  const [route, setRoute] = useState({ name: 'home' });
  const goHome = () => setRoute({ name: 'home' });

  return (
    <div className="app">
      {route.name === 'home' && <Home onStart={setRoute} />}
      {route.name === 'learn' && <Learn traps={route.traps} title={route.title} onBack={goHome} />}
      {route.name === 'quiz' && (
        <Quiz traps={route.traps} title={route.title} hideOpening={route.hideOpening} onBack={goHome} />
      )}
    </div>
  );
}
