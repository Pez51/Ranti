import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import UserAvatar from './UserAvatar';
import { useChatWorkspace } from '../../lib/chat-workspace-context';

export default function AccountMenu({ user, onLogout, onNavigate, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const workspace=useChatWorkspace();
  const container = useRef(null);
  const trigger = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    container.current?.querySelector('[role="menuitem"]')?.focus();
    const closeOutside = event => {
      if (!container.current?.contains(event.target)) setOpen(false);
    };
    const escape = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function navigateAway() { setOpen(false); onNavigate?.(); }
  function moveFocus(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...container.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  return <div ref={container} className="account-menu"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="account-avatar" aria-label="Opciones de mi cuenta"
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(value => !value)}>
      <UserAvatar user={user} />
    </button>
    {open && <div id={menuId} role="menu" aria-label="Mi cuenta" className={`account-options account-options-${align}`}
      onKeyDown={moveFocus}>
      <p className="account-options-name">{user?.display_name || user?.email?.split('@')[0] || 'Mi cuenta'}</p>
      <Link role="menuitem" to="/perfil" onClick={navigateAway}>Mi perfil</Link>
      <Link role="menuitem" to="/operaciones" onClick={navigateAway}>Mis operaciones</Link>
      {workspace?<button type="button" role="menuitem" onClick={()=>{navigateAway();workspace.openInbox();}}>Mis conversaciones</button>:<Link role="menuitem" to="/mensajes" onClick={navigateAway}>Mis conversaciones</Link>}
      <Link role="menuitem" to="/mis-publicaciones" onClick={navigateAway}>Mis publicaciones</Link>
      {user?.role === 'Administrador' && <Link role="menuitem" to="/admin" onClick={navigateAway}>Panel de administración</Link>}
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onLogout(); }}>Cerrar sesión</button>
    </div>}
  </div>;
}
