import { useEffect } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { Header, MobileNav } from "./components/Header";
import { Footer } from "./components/Footer";
import { ThemeProvider } from "./lib/theme";
import { I18nProvider } from "./lib/i18n";
import { Scanner } from "./pages/Scanner";
import { Manual } from "./pages/Manual";
import { Alphabet } from "./pages/Alphabet";
import { Variants } from "./pages/Variants";
import { NotFound } from "./pages/NotFound";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <I18nProvider>
    <ThemeProvider>
      <HashRouter>
        <ScrollToTop />
        <div className="app-bg relative min-h-screen">
          <div className="relative z-10 flex min-h-screen flex-col">
            <Header />
            <main className="flex-1 pb-24 md:pb-0">
              <Routes>
                <Route path="/" element={<Scanner />} />
                <Route path="/manual" element={<Manual />} />
                <Route path="/alphabet" element={<Alphabet />} />
                <Route path="/variants" element={<Variants />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
            <Footer />
            <MobileNav />
          </div>
        </div>
      </HashRouter>
    </ThemeProvider>
    </I18nProvider>
  );
}
