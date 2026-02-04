import Navbar from "../components/Navbar";
import { Outlet } from "react-router-dom";

export default function MainLayout() {
  return (
    <>
      <Navbar />
      <main className="container-fluid" style={{ marginTop: "64px" }}>
        <Outlet />
      </main>
    </>
  );
}
