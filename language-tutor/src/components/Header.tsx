import { Link } from 'react-router';

export default function Header() {
  return (
    <header className="topbar">
      <Link className="brand" to="/" aria-label="Go to tutor selection">
        <img src='/favicon.png'></img>
        <span>verba</span>
      </Link>
      <nav className="topnav" aria-label="Main navigation">
        <button className="nav-link active">My learning</button>
        <button className="nav-link">Explore</button>
        <button className="nav-link">Progress</button>
      </nav>
      <button className="profile-button" aria-label="Profile">
        J
      </button>
    </header>
  );
}
