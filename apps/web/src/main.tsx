import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SetupPage } from "./pages/setup-page";
import { AuthProvider, ProtectedRoute } from "./auth/auth-provider";
import { LoginPage } from "./pages/login-page";
import { PasswordPage } from "./pages/password-pages";
import { AccountPage } from "./pages/account-page";
import { AdministrationLayout } from "./pages/administration/layout";
import { DashboardPage } from "./pages/administration/dashboard";
import { CompanyDetailsPage, CompanyEditor, CompanyListPage } from "./pages/administration/companies";
import { TenantAdminsPage } from "./pages/administration/admins";
import { TenantConfigurationPage } from "./pages/administration/configuration";
import { OrganizationPage } from "./pages/organization/catalog";
import "./styles.css";

const queryClient = new QueryClient();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<PasswordPage />} />
          <Route path="/reset-password" element={<PasswordPage reset />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<AccountPage />} />
            <Route element={<AdministrationLayout platform={false} organization />}>
              <Route path="/app/organization/:catalog?" element={<OrganizationPage />} />
            </Route>
            <Route element={<AdministrationLayout platform={false} />}>
              <Route path="/app/company" element={<CompanyDetailsPage workspace />} />
              <Route path="/app/company/edit" element={<CompanyEditor workspace />} />
              <Route path="/app/company/configuration" element={<TenantConfigurationPage workspace />} />
            </Route>
          </Route>
          <Route element={<ProtectedRoute platform />}>
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/platform/account" element={<AccountPage />} />
            <Route element={<AdministrationLayout platform />}>
              <Route path="/platform" element={<DashboardPage />} />
              <Route path="/platform/companies" element={<CompanyListPage />} />
              <Route path="/platform/companies/new" element={<CompanyEditor create />} />
              <Route path="/platform/companies/:companyId" element={<CompanyDetailsPage />} />
              <Route path="/platform/companies/:companyId/edit" element={<CompanyEditor />} />
              <Route path="/platform/companies/:companyId/admins" element={<TenantAdminsPage />} />
              <Route path="/platform/companies/:companyId/configuration" element={<TenantConfigurationPage />} />
            </Route>
          </Route>
          <Route path="*" element={<main className="p-12"><h1 className="text-2xl font-semibold">Page not found</h1><Link className="mt-4 inline-block underline" to="/login">Return to sign in</Link></main>} />
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

