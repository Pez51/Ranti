import { ShieldCheck, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { rentalUnitLabel } from '../../lib/rental-units';
import PublicationGallery from './PublicationGallery';
import OpenChat from '../operations/OpenChat';
import UserAvatar from '../../components/layout/UserAvatar';
import MemberProfileDialog from '../../components/layout/MemberProfileDialog';
import { useChatWorkspace } from '../../lib/chat-workspace-context';
import ProductReviews from './ProductReviews';
import { usePaymentProfile } from '../../lib/use-payment-profile';

export default function ProductDetail({ requirePaymentSetup = false, requestPage = false }) {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [offerEnabled, setOfferEnabled] = useState(false);
  const [offerAmount, setOfferAmount] = useState('');
  const [confirmedOffer, setConfirmedOffer] = useState(null);
  const [profileOpen,setProfileOpen]=useState(false);
  const [meetingAt,setMeetingAt]=useState('');
  const [meetingLocation,setMeetingLocation]=useState('');
  const [requestMessage,setRequestMessage]=useState('');
  const workspace=useChatWorkspace();
  const session = getSession();
  const paymentSetup = usePaymentProfile(requirePaymentSetup ? session?.token : null);
  const isOwner = Boolean(session?.user?.id && product?.owner_id && session.user.id === product.owner_id);

  useEffect(() => {
    const controller = new AbortController();
    const loadProduct = async () => {
      try {
        setProduct(await apiRequest(`/publications/${id}`, { signal: controller.signal }));
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadProduct();
    return () => controller.abort();
  }, [id]);

  if (loading) return <p className="py-20 text-center font-bold text-gray-500">Cargando publicación…</p>;
  if (error || !product) return (
    <div role="alert" className="my-12 text-center py-16 bg-red-50 rounded-3xl border-4 border-red-300">
      <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
      <h2 className="text-2xl font-display font-bold">No se pudo cargar la publicación</h2>
      <p className="font-bold text-red-700 mt-2">{error}</p>
      <Link to="/" className="inline-block mt-6 underline font-bold">Volver al catálogo</Link>
    </div>
  );

  const price = product.modality === 'Préstamo' ? 'Gratis' : `S/ ${Number(product.price).toFixed(2)}`;
  const dated = product.modality !== 'Venta';
  const needsPaymentSetup = requirePaymentSetup && session && product.modality !== 'Préstamo' &&
    !paymentSetup.profile?.buyer_method;
  const hourly=product.modality==='Alquiler'&&product.rental_unit==='hour';
  const timed=hourly||requestPage&&dated;
  const peruInstant=value=>new Date(`${value}${value.length===16?':00':''}-05:00`).toISOString();
  const requestInstant=value=>timed?peruInstant(value):value;
  const money = value => Number(value).toFixed(2);
  const peruDay = value => value && new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
  const availableFrom = peruDay(product.available_from);
  const availableUntil = peruDay(product.available_until);
  const owner=product.owner||{id:product.owner_id,display_name:product.owner_name,avatar_url:product.owner_photo,operations_count:product.owner_operations_count};
  function openOwner(){if(workspace)workspace.showProfile(owner.id);else setProfileOpen(true);}

  function ask(isOffer = false) {
    setRequestError('');
    if (isOffer && (product.modality === 'Préstamo' || !/^\d+(?:\.\d{1,2})?$/.test(offerAmount) || Number(offerAmount) <= 0 || Number(offerAmount) >= Number(product.price))) {
      setRequestError('Tu oferta debe ser mayor que S/ 0.00 y menor que el precio publicado, con un máximo de dos decimales.');
      return;
    }
    if (dated && (!startDate || !endDate || startDate >= endDate ||
      (timed ? (new Date(requestInstant(startDate))<new Date(product.available_from)||(product.available_until&&new Date(requestInstant(endDate))>new Date(product.available_until))) :
        ((availableFrom && startDate < availableFrom) || (availableUntil && endDate > availableUntil))))) {
      setRequestError('Selecciona fechas válidas dentro de la disponibilidad indicada.');
      return;
    }
    if ((meetingAt || meetingLocation.trim()) && (!meetingAt || meetingLocation.trim().length < 3 ||
      new Date(peruInstant(meetingAt)) <= new Date() || dated && new Date(peruInstant(meetingAt)) >= new Date(requestInstant(startDate)))) {
      setRequestError('Indica lugar y hora futuros para el encuentro. Para un alquiler, el encuentro debe ser antes del inicio.');
      return;
    }
    setConfirmedOffer(isOffer ? money(offerAmount) : null);
    setConfirmation(true);
  }

  async function request() {
    if (busy || !session?.token) return;
    setBusy(true); setRequestError('');
    try {
      const body = { publication_id: product.id, requested_price: money(product.price),
        ...(confirmedOffer !== null ? { offered_price: confirmedOffer } : {}),
        requested_guarantee_amount: money(product.guarantee_amount),
        requested_contract_version: Number(product.contract_version),
        ...(product.modality==='Alquiler'?{requested_rental_unit:product.rental_unit||'day'}:{}),
        ...(dated ? { start_date: requestInstant(startDate), end_date: requestInstant(endDate) } : {}) };
      if (requestMessage.trim()) body.request_message = requestMessage.trim();
      if (meetingAt) {
        body.requested_meeting_at = peruInstant(meetingAt);
        body.requested_meeting_location = meetingLocation.trim();
      }
      const response = await apiRequest('/operations', { token: session.token, method: 'POST', body: JSON.stringify(body) });
      setCreated(response.operation);
      setConfirmation(false);
    } catch (failure) {
      setConfirmation(false);
      setRequestError(failure.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="py-6 max-w-6xl mx-auto">
      <Link to={requestPage?`/producto/${id}`:'/'} className="inline-block mb-6 text-ranti-ink font-bold hover:underline underline-offset-4 px-4 py-2">← {requestPage?'Volver a la ficha':'Volver al catálogo'}</Link>
      <div className={requestPage?'max-w-2xl mx-auto':'grid grid-cols-1 lg:grid-cols-3 gap-8'}>
        {!requestPage&&<div className="lg:col-span-2 space-y-8">
          <PublicationGallery key={product.id} images={product.images} title={product.title} modality={product.modality} />
          <div className="bg-white p-8 rounded-3xl border-4 border-ranti-ink shadow-solid">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-ranti-light text-ranti-dark font-bold text-xs px-3 py-1 rounded-full border-2 border-ranti-ink uppercase">{product.category==='Otros' && product.category_other?product.category_other:product.category}</span>
              <span className="text-gray-500 font-bold text-sm">{product.condition_rating && <span aria-label={`Estado físico: ${product.condition_rating} de 5 estrellas`}>{'★'.repeat(product.condition_rating)}{'☆'.repeat(5-product.condition_rating)} · </span>}{product.condition}</span>
            </div>
            <h1 className="text-4xl font-display font-bold text-ranti-ink mb-4 leading-tight">{product.title}</h1>
            <p className="text-lg font-body font-semibold text-gray-600 mb-6 whitespace-pre-wrap">{product.description}</p>
            {product.accessories&&<p><strong>Accesorios incluidos</strong> · {product.accessories}</p>}
            {requirePaymentSetup?<Link to={`/producto/${id}/oferente`} className="publication-owner-button">Ver perfil público del oferente</Link>:
            session?<button type="button" className="publication-owner-button" disabled={!owner.id} onClick={openOwner} aria-label={`Ver perfil de ${owner.display_name||'Oferente UCSM'}`}>
              <span className="w-14 h-14 bg-green-200 rounded-full border-4 border-ranti-ink flex items-center justify-center overflow-hidden shrink-0"><UserAvatar user={owner}/></span>
              <span><strong className="font-display text-lg">{owner.display_name||'Oferente UCSM'}</strong><span className="block text-sm text-gray-500">Ver perfil y reputación por rol</span></span>
            </button>:<Link to="/login" className="publication-owner-button"><span className="chat-avatar"><UserAvatar user={owner}/></span><span>{owner.display_name||'Oferente UCSM'} · Ingresa para ver su perfil y contacto</span></Link>}
            {profileOpen&&owner.id&&<MemberProfileDialog key={owner.id} id={owner.id} token={session?.token} onClose={()=>setProfileOpen(false)}/>}
            <ProductReviews key={product.id} publicationId={product.id}/>
          </div>
        </div>}

        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-3xl border-4 border-ranti-ink shadow-solid sticky top-32">
            {requestPage&&<><h1>{product.modality==='Venta'?'Revisar compra':'Solicitar fechas'}</h1><h2>{product.title}</h2></>}
            {requestPage&&product.accessories&&<p>Accesorios incluidos · {product.accessories}</p>}
            <h3 className="font-display font-bold text-3xl text-ranti-ink mb-4">{price}{product.modality === 'Alquiler' && <span className="text-lg text-gray-500"> /{rentalUnitLabel(product.rental_unit)}</span>}</h3>
            {Number(product.guarantee_amount) > 0 && (
              <div className="bg-gray-50 p-4 rounded-2xl border-4 border-ranti-ink mb-6 flex items-start gap-3">
                <ShieldCheck size={24} className="text-ranti-secondary flex-shrink-0" />
                <p className="text-sm font-bold text-gray-600">Garantía {product.guarantee_required?'obligatoria':'referencial ante daños'}: S/ {Number(product.guarantee_amount).toFixed(2)}. {product.guarantee_required?'El importe aplicable se muestra al revisar el pago de prueba.':'No se exige por adelantado ni se cobra automáticamente.'}</p>
              </div>
            )}
            <p className="text-sm font-bold text-gray-600 mb-3">Garantía: S/ {money(product.guarantee_amount)} · Versión {product.contract_version}</p>
            <OpenChat publicationId={product.id} ownerId={product.owner_id}/>
            {product.availability && <div className="product-availability">
              <strong className={`availability-badge availability-${product.availability.state}`}>{product.availability.label}</strong>
              {product.availability.intervals?.map((interval,index)=><p key={index}>Ocupado: {new Date(interval.start).toLocaleString('es-PE')} → {new Date(interval.end).toLocaleString('es-PE')}{interval.in_use?' · Devolución pendiente':''}</p>)}
              {product.availability.return_pending && <p>El artículo está en uso. La disponibilidad futura depende de la devolución; el servidor comprobará tus fechas.</p>}
            </div>}
            {isOwner ? (
              <div className="bg-yellow-50 p-6 rounded-2xl border-4 border-ranti-ink my-4 text-center">
                <p className="font-display font-bold text-xl text-ranti-ink mb-2">Esta es tu publicación</p>
                <p className="text-sm font-body font-bold text-gray-600 mb-4">No puedes solicitar ni realizar ofertas sobre tu propio bien.</p>
                <Link to="/mis-publicaciones" className="inline-block bg-ranti-ink text-white px-6 py-3 rounded-xl border-2 border-ranti-ink font-bold hover:bg-gray-800 transition-all">
                  Gestionar en Mis Publicaciones
                </Link>
              </div>
            ) : requirePaymentSetup&&!requestPage?(
              product.availability?.can_request===false?<p>Artículo no disponible</p>:
              <Link to={`/producto/${id}/solicitar`} className="product-offer-toggle">{dated?'Solicitar fechas':'Revisar compra'}</Link>
            ) : (
              <>
                {dated && <div className="workflow !p-3 !m-0 mb-4">
                  <p>{availableUntil?`Disponibilidad: ${availableFrom} a ${availableUntil} (fin exclusivo).`:`Disponible desde ${availableFrom}, sin fecha límite de disponibilidad.`}</p>
                  {!availableUntil&&<p>Indica el inicio y el fin del período que necesitas. La publicación no tiene fecha límite, pero cada solicitud debe tener un período definido.</p>}
                  <label htmlFor="request-start">Inicio</label>
                  <input id="request-start" type={timed?'datetime-local':'date'} min={availableFrom ? `${availableFrom}${timed?'T00:00':''}`:undefined} max={availableUntil ? `${availableUntil}${timed?'T23:59':''}`:undefined} value={startDate} onChange={event => setStartDate(event.target.value)} />
                  <label htmlFor="request-end">Fin</label>
                  <input id="request-end" type={timed?'datetime-local':'date'} min={availableFrom ? `${availableFrom}${timed?'T00:00':''}`:undefined} max={availableUntil ? `${availableUntil}${timed?'T23:59':''}`:undefined} value={endDate} onChange={event => setEndDate(event.target.value)} />
                  {hourly&&<p>Selecciona fecha y hora de Perú. El precio se expresa por hora, no por toda la disponibilidad.</p>}
                </div>}
                {requestPage&&!created&&<div className="workflow">
                  <label>Proponer fecha y hora de encuentro (Perú)<input type="datetime-local" value={meetingAt} onChange={event=>setMeetingAt(event.target.value)}/></label>
                  <label>Lugar propuesto<input maxLength={200} value={meetingLocation} onChange={event=>setMeetingLocation(event.target.value)}/></label>
                  <label>Mensaje para el oferente<textarea maxLength={500} value={requestMessage} onChange={event=>setRequestMessage(event.target.value)}/></label>
                </div>}
                {created ? <div role="status" className="bg-green-50 p-4 rounded-xl font-bold">
                  {created.offered_price != null ? 'Oferta enviada. El oferente podrá aceptar o rechazar tu monto; no hay reserva ni cobro.' : 'Solicitud pendiente. El oferente aún debe decidir; no hay reserva ni cobro.'}
                  <Link to={requirePaymentSetup ? `/operaciones/${created.id}` : '/operaciones'} className="block underline mt-2">Ver mis operaciones</Link>
                </div> : needsPaymentSetup ?
                  <div className="workflow"><p>{paymentSetup.error || 'Configura tu método de pago antes de solicitar.'}</p>
                    <Link to={`/perfil/pagos?rol=comprador&volver=${encodeURIComponent(`/producto/${id}${requestPage?'/solicitar':''}`)}`}>Configurar método de pago</Link>
                  </div> : session ?
                  <button type="button" disabled={busy || product.availability?.can_request===false} onClick={() => ask()} className="w-full bg-ranti-secondary text-ranti-ink px-6 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-xl">{product.availability?.can_request===false?'Artículo no disponible':'Solicitar operación'}</button> :
                  <Link to="/login" className="block text-center underline font-bold">Inicia sesión para solicitar</Link>}
                {!created && session && !needsPaymentSetup && product.modality !== 'Préstamo' && product.availability?.can_request!==false && <div className="product-offer">
                  <button type="button" className="product-offer-toggle" disabled={busy} aria-expanded={offerEnabled} onClick={() => { setOfferEnabled(value => !value); setConfirmation(false); setRequestError(''); }}>Hacer una oferta</button>
                  {offerEnabled && !confirmation && <div className="product-offer-form">
                    <label htmlFor="offer-amount">Tu oferta (S/){product.modality === 'Alquiler' ? ` por ${rentalUnitLabel(product.rental_unit)}` : ''}</label>
                    <input id="offer-amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={offerAmount} onChange={event => setOfferAmount(event.target.value)} />
                    <p>Propón un monto menor al publicado. El oferente puede aceptarlo o rechazarlo; el precio del anuncio y la garantía no cambian.{dated ? ' Se mantienen las fechas que seleccionaste y la unidad de alquiler.' : ''}</p>
                    <button type="button" disabled={busy} onClick={() => ask(true)}>Revisar oferta</button>
                  </div>}
                </div>}
                {requestError && <p role="alert" className="text-red-700 font-bold mt-3">{requestError}</p>}
                {confirmation && <div role="dialog" aria-label="Confirmar solicitud" className="workflow">
                  <h2 className="font-bold">{confirmedOffer !== null ? 'Confirmar oferta' : 'Confirmar solicitud'}</h2>
                  <p>Precio: S/ {money(product.price)}{product.modality==='Alquiler'?` por ${rentalUnitLabel(product.rental_unit)}`:''} · Garantía {product.guarantee_required?'obligatoria':'referencial'}: S/ {money(product.guarantee_amount)} · Versión {product.contract_version}</p>
                  {confirmedOffer !== null && <p className="product-offer-amount">Tu oferta: S/ {confirmedOffer}{product.modality === 'Alquiler' ? ` por ${rentalUnitLabel(product.rental_unit)}` : ''}. Este será el precio acordado solo si el oferente acepta.</p>}
                  {dated && <p>Del {startDate} al {endDate} (fin exclusivo).</p>}
                  {meetingAt&&<p>Encuentro propuesto el {meetingAt.replace('T',' a las ')} (Perú), en {meetingLocation.trim()}.</p>}
                  <p>La solicitud quedará pendiente de decisión. No se realizará ningún cobro ni reserva ahora.</p>
                  <button type="button" disabled={busy} onClick={request}>{busy ? 'Enviando…' : confirmedOffer !== null ? 'Enviar oferta' : 'Confirmar solicitud'}</button>
                  <button type="button" disabled={busy} onClick={() => setConfirmation(false)}>Volver</button>
                </div>}
                <p className="text-xs font-bold text-gray-400 text-center mt-4 flex items-center justify-center gap-1"><AlertCircle size={14}/> No se realizará ningún cobro.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
