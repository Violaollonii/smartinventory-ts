import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

/** App shell: top navigation plus the current page. Redirects to /login when signed out. */
export function Layout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) return <p className="page-status">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">SmartInventory</span>
          <nav aria-label="Main">
            <NavLink to="/" end>
              Dashboard
            </NavLink>
            <NavLink to="/products">Products</NavLink>
            <NavLink to="/sales/new">New sale</NavLink>
          </nav>
          <div className="account">
            <span className="account-name">
              {user.name} <span className="badge">{user.role}</span>
            </span>
            <button type="button" className="button-quiet" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
