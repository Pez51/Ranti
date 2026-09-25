import { Mail, Lock, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    // Validación frontend ACTUALIZADA para los nuevos dominios UCSM
    if (!email.endsWith('@estudiante.ucsm.edu.pe') && !email.endsWith('@ucsm.edu.pe')) {
      alert('Se debe utilizar un correo institucional de la UCSM para ingresar');
      return;
    }
    // Simulación de login exitoso
    navigate('/oferente');
  };

  return (
    <div className="py-12 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl border-4 border-ranti-ink shadow-solid">
        
        <div className="text-center mb-8">
          <h2 className="text-4xl font-display font-bold text-ranti-ink mb-2">Ingresar</h2>
          <p className="font-body font-bold text-gray-500">Accede a la comunidad Ranti UCSM</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block font-bold text-sm text-ranti-ink mb-2">Correo Institucional</label>
            <div className="bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 flex items-center focus-within:shadow-solid-sm focus-within:-translate-y-1 transition-all">
              <Mail size={20} className="text-gray-400 mr-2" />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@estudiante.ucsm.edu.pe" // Placeholder actualizado
                className="w-full bg-transparent outline-none font-body font-bold text-ranti-ink" 
                required 
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-sm text-ranti-ink mb-2">Contraseña</label>
            <div className="bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 flex items-center focus-within:shadow-solid-sm focus-within:-translate-y-1 transition-all">
              <Lock size={20} className="text-gray-400 mr-2" />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full bg-transparent outline-none font-body font-bold text-ranti-ink" 
                required 
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-sm font-bold">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-ranti-primary border-2 border-ranti-ink rounded" />
              <span className="text-gray-600">Recordarme</span>
            </label>
            <a href="#" className="text-ranti-secondary hover:text-ranti-primary hover:underline underline-offset-2">¿Olvidaste tu contraseña?</a>
          </div>

          <button 
            type="submit" 
            className="w-full bg-green-gradient text-ranti-ink px-6 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-xl hover:-translate-y-1 hover:shadow-solid active:translate-y-1 active:shadow-none transition-all flex justify-center items-center gap-2"
          >
            <LogIn size={20} strokeWidth={3} /> Iniciar Sesión
          </button>
        </form>

        <div className="mt-8 pt-6 border-t-4 border-gray-100 text-center">
          <p className="font-bold text-gray-500 mb-4">¿No tienes cuenta o eres egresado sin correo?</p>
          <button className="w-full bg-ranti-light text-ranti-dark px-6 py-3 rounded-xl border-4 border-ranti-ink font-bold hover:bg-gray-100 transition-all flex justify-center items-center gap-2">
            <UserPlus size={20} /> Solicitar Verificación
          </button>
        </div>

        <div className="mt-6 flex items-start gap-2 bg-yellow-100 p-3 rounded-lg border-2 border-yellow-300 text-xs font-bold text-yellow-800">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <p>Tus datos están protegidos según la Ley N.º 29733 (Ley de Protección de Datos Personales).</p>
        </div>

      </div>
    </div>
  );
}