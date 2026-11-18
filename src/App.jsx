import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Expenses from "./pages/Expenses";
import Sales from "./pages/Sales";
import Profit from "./pages/Profit";
import Restock from "./pages/Restock";
import Settings from "./pages/Settings";
import ReceiptPage from "./pages/ReceiptPage";

const guard = (el) => <ProtectedRoute>{el}</ProtectedRoute>;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={guard(<Dashboard />)} />
          <Route path="/products" element={guard(<Products />)} />
          <Route path="/restock" element={guard(<Restock />)} />
          <Route path="/sales" element={guard(<Sales />)} />
          <Route path="/expenses" element={guard(<Expenses />)} />
          <Route path="/profit" element={guard(<Profit />)} />
          <Route path="/settings" element={guard(<Settings />)} />
          <Route path="/receipts/:id" element={guard(<ReceiptPage />)} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}