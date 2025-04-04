import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AuthResponse {
  user: {
    id: number;
    username: string;
  };
  token: string;
}

const Login = () => {
  // Состояние для обоих вкладок
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  
  // Состояние для логина
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Состояние для регистрации
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordConfirm, setRegPasswordConfirm] = useState("");
  const [isRegLoading, setIsRegLoading] = useState(false);
  const [regError, setRegError] = useState("");
  
  // Состояние для кнопки быстрого входа админа
  const [isAdminLoginLoading, setIsAdminLoginLoading] = useState(false);
  
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    
    console.log("Login: login attempt with username:", username);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      }).catch(err => {
        console.error("Network error during login:", err);
        throw new Error("Ошибка сети при отправке запроса авторизации");
      });
      
      if (!response || !response.ok) {
        let errorMessage = "Ошибка при входе в систему";
        
        try {
          const errorData = await response.json();
          if (errorData && errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (jsonError) {
          console.error("Error parsing error response:", jsonError);
        }
        
        throw new Error(errorMessage);
      }
      
      let data: AuthResponse;
      try {
        data = await response.json() as AuthResponse;
        console.log("Login: successful login response", data);
      } catch (jsonError) {
        console.error("Error parsing login response:", jsonError);
        throw new Error("Неверный формат ответа сервера");
      }
      
      if (!data || !data.token || !data.user) {
        throw new Error("Сервер вернул неполные данные авторизации");
      }
      
      // Сохраняем токен и информацию о пользователе
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("isAuthenticated", "true");
      
      // Показываем уведомление об успешном входе
      toast({
        title: "Успешный вход",
        description: "Вы успешно вошли в систему",
      });
      
      // Добавляем небольшую задержку для обновления состояния
      setTimeout(() => {
        // Перенаправляем в личный кабинет
        console.log("Login: redirecting to /cabinet");
        navigate("/cabinet");
      }, 100);
    } catch (error: any) {
      console.error("Login: Error during login process:", error);
      const errorMessage = error?.message || "Произошла ошибка при входе в систему";
      setError(errorMessage);
      toast({
        title: "Ошибка входа",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Проверка пароля
    if (regPassword !== regPasswordConfirm) {
      setRegError("Пароли не совпадают");
      toast({
        title: "Ошибка регистрации",
        description: "Пароли не совпадают",
        variant: "destructive",
      });
      return;
    }
    
    setIsRegLoading(true);
    setRegError("");
    
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          username: regUsername, 
          email: regEmail,
          password: regPassword 
        }),
      }).catch(err => {
        console.error("Network error during registration:", err);
        throw new Error("Ошибка сети при отправке запроса регистрации");
      });
      
      if (!response || !response.ok) {
        let errorMessage = "Ошибка при регистрации";
        
        try {
          const errorData = await response.json();
          if (errorData && errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (jsonError) {
          console.error("Error parsing error response:", jsonError);
        }
        
        throw new Error(errorMessage);
      }
      
      let data;
      try {
        data = await response.json();
        console.log("Register: successful registration response", data);
      } catch (jsonError) {
        console.error("Error parsing registration response:", jsonError);
        throw new Error("Неверный формат ответа сервера");
      }
      
      // Показываем уведомление об успешной регистрации
      toast({
        title: "Успешная регистрация",
        description: "Вы успешно зарегистрировались в системе",
      });
      
      // Переключаемся на вкладку логина
      setActiveTab("login");
      setUsername(regUsername);
      setPassword("");
      
      // Очищаем форму регистрации
      setRegUsername("");
      setRegEmail("");
      setRegPassword("");
      setRegPasswordConfirm("");
    } catch (error: any) {
      console.error("Register: Error during registration process:", error);
      const errorMessage = error?.message || "Произошла ошибка при регистрации";
      setRegError(errorMessage);
      toast({
        title: "Ошибка регистрации",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsRegLoading(false);
    }
  };
  
  // Функция для быстрого входа администратора
  const handleAdminLogin = async () => {
    setIsAdminLoginLoading(true);
    setError("");
    
    try {
      console.log("Login: admin login attempt");
      
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          username: "admin", 
          password: "admin123" 
        }),
      }).catch(err => {
        console.error("Network error during login:", err);
        throw new Error("Ошибка сети при отправке запроса авторизации");
      });
      
      if (!response || !response.ok) {
        let errorMessage = "Ошибка при входе администратора";
        
        try {
          const errorData = await response.json();
          if (errorData && errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (jsonError) {
          console.error("Error parsing error response:", jsonError);
        }
        
        throw new Error(errorMessage);
      }
      
      let data: AuthResponse;
      try {
        data = await response.json() as AuthResponse;
        console.log("Login: successful admin login response", data);
      } catch (jsonError) {
        console.error("Error parsing login response:", jsonError);
        throw new Error("Неверный формат ответа сервера");
      }
      
      if (!data || !data.token || !data.user) {
        throw new Error("Сервер вернул неполные данные авторизации");
      }
      
      // Сохраняем токен и информацию о пользователе
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("isAuthenticated", "true");
      
      // Показываем уведомление об успешном входе
      toast({
        title: "Успешный вход",
        description: "Вы успешно вошли в систему как администратор",
      });
      
      // Добавляем небольшую задержку для обновления состояния
      setTimeout(() => {
        // Перенаправляем в личный кабинет
        console.log("Login: redirecting to /cabinet");
        navigate("/cabinet");
      }, 100);
    } catch (error: any) {
      console.error("Login: Error during admin login process:", error);
      const errorMessage = error?.message || "Произошла ошибка при входе администратора";
      setError(errorMessage);
      toast({
        title: "Ошибка входа",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsAdminLoginLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      <Card className="w-[400px] bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-2xl">Личный кабинет</CardTitle>
          <CardDescription className="text-gray-400">
            Войдите или зарегистрируйтесь для доступа к настройкам
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <Tabs 
            defaultValue="login" 
            value={activeTab} 
            onValueChange={(value) => setActiveTab(value as "login" | "register")}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-4 bg-gray-800">
              <TabsTrigger value="login" className="data-[state=active]:bg-gray-700">Вход</TabsTrigger>
              <TabsTrigger value="register" className="data-[state=active]:bg-gray-700">Регистрация</TabsTrigger>
            </TabsList>
            
            {/* Вкладка входа */}
            <TabsContent value="login" className="mt-0">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Имя пользователя или Email</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Имя пользователя или полный email"
                    className="bg-gray-800 border-gray-700 text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Пароль</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-gray-800 border-gray-700 text-white"
                    required
                  />
                </div>
                {error && (
                  <div className="text-red-500 text-sm p-2 bg-red-900/20 rounded border border-red-800">
                    {error}
                  </div>
                )}
                <Button 
                  type="submit" 
                  className="w-full mt-4" 
                  disabled={isLoading || !username || !password}
                >
                  {isLoading ? "Вход..." : "Войти"}
                </Button>
              </form>
            </TabsContent>
            
            {/* Вкладка регистрации */}
            <TabsContent value="register" className="mt-0">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-username">Имя пользователя</Label>
                  <Input
                    id="reg-username"
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="Придумайте имя пользователя"
                    className="bg-gray-800 border-gray-700 text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="example@example.com"
                    className="bg-gray-800 border-gray-700 text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">Пароль</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-gray-800 border-gray-700 text-white"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password-confirm">Подтверждение пароля</Label>
                  <Input
                    id="reg-password-confirm"
                    type="password"
                    value={regPasswordConfirm}
                    onChange={(e) => setRegPasswordConfirm(e.target.value)}
                    placeholder="••••••••"
                    className="bg-gray-800 border-gray-700 text-white"
                    required
                  />
                </div>
                {regError && (
                  <div className="text-red-500 text-sm p-2 bg-red-900/20 rounded border border-red-800">
                    {regError}
                  </div>
                )}
                <Button 
                  type="submit" 
                  className="w-full mt-4" 
                  disabled={isRegLoading || !regUsername || !regEmail || !regPassword || !regPasswordConfirm}
                >
                  {isRegLoading ? "Регистрация..." : "Зарегистрироваться"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        
        <CardFooter className="flex flex-col space-y-4 text-sm text-gray-500 border-t border-gray-800 pt-4">
          <div className="w-full">
            {activeTab === "login" ? (
              <p>Нет аккаунта? <Button variant="link" className="p-0 h-auto text-blue-500" onClick={() => setActiveTab("register")}>Регистрация</Button></p>
            ) : (
              <p>Уже есть аккаунт? <Button variant="link" className="p-0 h-auto text-blue-500" onClick={() => setActiveTab("login")}>Вход</Button></p>
            )}
          </div>
          
          
        </CardFooter>
      </Card>
    </div>
  );
};

export default Login;