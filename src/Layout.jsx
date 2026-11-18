import { NavLink } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { useSettings } from "./useSettings";
import logo from "./assets/logo.jpg";

export default function Layout({ children }) {
  const { logout } = useAuth();
  const [settings] = useSettings();
  return (
    <div className="shell">
      <header className="topbar">
        {settings?.business_name
          ? <span className="brand">{settings.business_name}</span>
          : <img src={logo} alt="SellWise" className="logo small" />}
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/products">Products</NavLink>
          <NavLink to="/restock">Restock</NavLink>
          <NavLink to="/sales">Sales</NavLink>
          <NavLink to="/expenses">Expenses</NavLink>
          <NavLink to="/profit">Profit</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <button className="outline small" onClick={logout}>Log out</button>
      </header>
      {children}
    </div>
  );
}