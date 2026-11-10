import { NavLink } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function Layout({ children }) {
  const { logout } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Sellwise</span>
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/products">Products</NavLink>
          <NavLink to="/restock">Restock</NavLink>
          <NavLink to="/sales">Sales</NavLink>
          <NavLink to="/expenses">Expenses</NavLink>
          <NavLink to="/profit">Profit</NavLink>
        </nav>
        <button className="outline small" onClick={logout}>Log out</button>
      </header>
      {children}
    </div>
  );
}