import { createContext, useContext, useEffect, useState } from "react";

type AuthCtx = {
  isAuth: boolean;
  login: (t: string) => void;
  logout: () => void;
};

const Ctx = createContext<AuthCtx>({
  isAuth: false,
  login: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuth, setIsAuth] = useState(false);

  //  Verifica si hay token al iniciar
  useEffect(() => {
    setIsAuth(!!sessionStorage.getItem("token"));
  }, []);

  //  Guarda el token en sessionStorage 
  const login = (t: string) => {
    sessionStorage.setItem("token", t);
    setIsAuth(true);
  };

  // Elimina token de sessionStorage (logout manual o expirado)
  const logout = () => {
    sessionStorage.removeItem("token");
    setIsAuth(false);
  };

  return (
    <Ctx.Provider value={{ isAuth, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}
