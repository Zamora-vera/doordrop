import React, { useEffect, useMemo, useState } from 'react';
import { Check, Edit3, KeyRound, Loader2, Mail, Phone, Plus, Save, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

type PermissionKey =
  | 'clients.read'
  | 'shipments.read'
  | 'shipments.manage'
  | 'tickets.read'
  | 'tickets.manage'
  | 'webmail.read'
  | 'webmail.send'
  | 'reports.read';

type StaffMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  title: string;
  role: 'support';
  status: 'active' | 'suspended' | 'closed';
  permissions: PermissionKey[];
  lastLoginAt?: string | null;
  createdAt?: string | null;
};

type StaffForm = {
  name: string;
  email: string;
  phone: string;
  title: string;
  password: string;
  status: StaffMember['status'];
  permissions: PermissionKey[];
};

const permissionKeys: PermissionKey[] = [
  'clients.read',
  'shipments.read',
  'shipments.manage',
  'tickets.read',
  'tickets.manage',
  'webmail.read',
  'webmail.send',
  'reports.read'
];

const defaultPermissions: PermissionKey[] = ['clients.read', 'shipments.read', 'tickets.read', 'tickets.manage', 'webmail.read'];

const copyByLanguage: Record<string, any> = {
  es: {
    eyebrow: 'Operación interna', title: 'Equipo interno', subtitle: 'Gestiona las cuentas reales que ayudan a operar y asistir DoorDrop.', newMember: 'Nuevo miembro', refresh: 'Actualizar', loading: 'Cargando equipo…', emptyTitle: 'Todavía no hay miembros internos', emptyText: 'Crea la primera cuenta de soporte cuando tengas un operador real asignado.', total: 'Total', active: 'Activos', suspended: 'Suspendidos', role: 'Soporte interno', edit: 'Editar', suspend: 'Suspender', activate: 'Activar', statusActive: 'Activo', statusSuspended: 'Suspendido', statusClosed: 'Cerrado', permissions: 'permisos', never: 'Nunca ha iniciado sesión', lastLogin: 'Último acceso', created: 'Creado', formNew: 'Crear miembro del equipo', formEdit: 'Editar miembro del equipo', name: 'Nombre completo', email: 'Correo de acceso', phone: 'Teléfono', titleField: 'Cargo', password: 'Contraseña inicial', passwordHint: 'Mínimo 12 caracteres. En edición, déjalo vacío para conservarla.', selectPermissions: 'Permisos del perfil', cancel: 'Cancelar', save: 'Guardar miembro', update: 'Guardar cambios', required: 'Completa nombre, correo y contraseña.', passwordRequired: 'La contraseña debe tener al menos 12 caracteres.', saved: 'Equipo actualizado correctamente.', failed: 'No se pudo cargar el equipo.', confirmSuspend: '¿Suspender esta cuenta? Se invalidará su sesión activa.', confirmActivate: '¿Activar esta cuenta?', noPermission: 'Sin permisos asignados', security: 'La contraseña se guarda únicamente como hash y nunca se devuelve por API.', permissionLabels: { 'clients.read': 'Ver clientes', 'shipments.read': 'Ver envíos', 'shipments.manage': 'Gestionar envíos', 'tickets.read': 'Ver tickets', 'tickets.manage': 'Gestionar tickets', 'webmail.read': 'Leer webmail', 'webmail.send': 'Enviar webmail', 'reports.read': 'Ver reportes' }
  },
  en: {
    eyebrow: 'Internal operations', title: 'Internal team', subtitle: 'Manage the real accounts that operate and support DoorDrop.', newMember: 'New member', refresh: 'Refresh', loading: 'Loading team…', emptyTitle: 'No internal members yet', emptyText: 'Create the first support account when a real operator is assigned.', total: 'Total', active: 'Active', suspended: 'Suspended', role: 'Internal support', edit: 'Edit', suspend: 'Suspend', activate: 'Activate', statusActive: 'Active', statusSuspended: 'Suspended', statusClosed: 'Closed', permissions: 'permissions', never: 'Has not logged in', lastLogin: 'Last access', created: 'Created', formNew: 'Create team member', formEdit: 'Edit team member', name: 'Full name', email: 'Login email', phone: 'Phone', titleField: 'Job title', password: 'Initial password', passwordHint: 'Minimum 12 characters. Leave blank when editing to keep it.', selectPermissions: 'Profile permissions', cancel: 'Cancel', save: 'Save member', update: 'Save changes', required: 'Complete name, email and password.', passwordRequired: 'Password must be at least 12 characters.', saved: 'Team updated successfully.', failed: 'The team could not be loaded.', confirmSuspend: 'Suspend this account? Its active session will be invalidated.', confirmActivate: 'Activate this account?', noPermission: 'No permissions assigned', security: 'The password is stored only as a hash and is never returned by the API.', permissionLabels: { 'clients.read': 'View clients', 'shipments.read': 'View shipments', 'shipments.manage': 'Manage shipments', 'tickets.read': 'View tickets', 'tickets.manage': 'Manage tickets', 'webmail.read': 'Read webmail', 'webmail.send': 'Send webmail', 'reports.read': 'View reports' }
  },
  it: {
    eyebrow: 'Operazioni interne', title: 'Team interno', subtitle: 'Gestisci gli account reali che operano e assistono DoorDrop.', newMember: 'Nuovo membro', refresh: 'Aggiorna', loading: 'Caricamento team…', emptyTitle: 'Nessun membro interno', emptyText: 'Crea il primo account di supporto quando assegni un operatore reale.', total: 'Totale', active: 'Attivi', suspended: 'Sospesi', role: 'Supporto interno', edit: 'Modifica', suspend: 'Sospendi', activate: 'Attiva', statusActive: 'Attivo', statusSuspended: 'Sospeso', statusClosed: 'Chiuso', permissions: 'permessi', never: 'Nessun accesso', lastLogin: 'Ultimo accesso', created: 'Creato', formNew: 'Crea membro del team', formEdit: 'Modifica membro del team', name: 'Nome completo', email: 'Email di accesso', phone: 'Telefono', titleField: 'Ruolo', password: 'Password iniziale', passwordHint: 'Minimo 12 caratteri. In modifica, lascia vuoto per conservarla.', selectPermissions: 'Permessi del profilo', cancel: 'Annulla', save: 'Salva membro', update: 'Salva modifiche', required: 'Completa nome, email e password.', passwordRequired: 'La password deve avere almeno 12 caratteri.', saved: 'Team aggiornato correttamente.', failed: 'Impossibile caricare il team.', confirmSuspend: 'Sospendere questo account? La sessione attiva sarà invalidata.', confirmActivate: 'Attivare questo account?', noPermission: 'Nessun permesso assegnato', security: 'La password viene salvata solo come hash e non viene restituita dall’API.', permissionLabels: { 'clients.read': 'Vedi clienti', 'shipments.read': 'Vedi spedizioni', 'shipments.manage': 'Gestisci spedizioni', 'tickets.read': 'Vedi ticket', 'tickets.manage': 'Gestisci ticket', 'webmail.read': 'Leggi webmail', 'webmail.send': 'Invia webmail', 'reports.read': 'Vedi report' }
  },
  fr: {
    eyebrow: 'Opérations internes', title: 'Équipe interne', subtitle: 'Gérez les comptes réels qui opèrent et assistent DoorDrop.', newMember: 'Nouveau membre', refresh: 'Actualiser', loading: 'Chargement de l’équipe…', emptyTitle: 'Aucun membre interne', emptyText: 'Créez le premier compte de support lorsqu’un opérateur réel est affecté.', total: 'Total', active: 'Actifs', suspended: 'Suspendus', role: 'Support interne', edit: 'Modifier', suspend: 'Suspendre', activate: 'Activer', statusActive: 'Actif', statusSuspended: 'Suspendu', statusClosed: 'Fermé', permissions: 'permissions', never: 'Aucune connexion', lastLogin: 'Dernier accès', created: 'Créé', formNew: 'Créer un membre', formEdit: 'Modifier le membre', name: 'Nom complet', email: 'E-mail de connexion', phone: 'Téléphone', titleField: 'Fonction', password: 'Mot de passe initial', passwordHint: '12 caractères minimum. En modification, laissez vide pour le conserver.', selectPermissions: 'Permissions du profil', cancel: 'Annuler', save: 'Enregistrer', update: 'Enregistrer les modifications', required: 'Remplissez le nom, l’e-mail et le mot de passe.', passwordRequired: 'Le mot de passe doit contenir au moins 12 caractères.', saved: 'Équipe mise à jour.', failed: 'Impossible de charger l’équipe.', confirmSuspend: 'Suspendre ce compte ? Sa session active sera invalidée.', confirmActivate: 'Activer ce compte ?', noPermission: 'Aucune permission', security: 'Le mot de passe est enregistré uniquement sous forme de hash et n’est jamais renvoyé par l’API.', permissionLabels: { 'clients.read': 'Voir les clients', 'shipments.read': 'Voir les envois', 'shipments.manage': 'Gérer les envois', 'tickets.read': 'Voir les tickets', 'tickets.manage': 'Gérer les tickets', 'webmail.read': 'Lire le webmail', 'webmail.send': 'Envoyer via webmail', 'reports.read': 'Voir les rapports' }
  },
  de: {
    eyebrow: 'Interner Betrieb', title: 'Internes Team', subtitle: 'Verwalte die echten Konten für Betrieb und Support von DoorDrop.', newMember: 'Neues Mitglied', refresh: 'Aktualisieren', loading: 'Team wird geladen…', emptyTitle: 'Noch keine internen Mitglieder', emptyText: 'Erstelle ein Supportkonto, sobald ein echter Mitarbeiter zugewiesen ist.', total: 'Gesamt', active: 'Aktiv', suspended: 'Gesperrt', role: 'Interner Support', edit: 'Bearbeiten', suspend: 'Sperren', activate: 'Aktivieren', statusActive: 'Aktiv', statusSuspended: 'Gesperrt', statusClosed: 'Geschlossen', permissions: 'Berechtigungen', never: 'Noch keine Anmeldung', lastLogin: 'Letzter Zugriff', created: 'Erstellt', formNew: 'Teammitglied erstellen', formEdit: 'Teammitglied bearbeiten', name: 'Vollständiger Name', email: 'Login-E-Mail', phone: 'Telefon', titleField: 'Position', password: 'Startpasswort', passwordHint: 'Mindestens 12 Zeichen. Beim Bearbeiten leer lassen, um es beizubehalten.', selectPermissions: 'Profilberechtigungen', cancel: 'Abbrechen', save: 'Mitglied speichern', update: 'Änderungen speichern', required: 'Name, E-Mail und Passwort sind erforderlich.', passwordRequired: 'Das Passwort muss mindestens 12 Zeichen haben.', saved: 'Team erfolgreich aktualisiert.', failed: 'Team konnte nicht geladen werden.', confirmSuspend: 'Dieses Konto sperren? Die aktive Sitzung wird ungültig.', confirmActivate: 'Dieses Konto aktivieren?', noPermission: 'Keine Berechtigungen', security: 'Das Passwort wird nur als Hash gespeichert und nie über die API zurückgegeben.', permissionLabels: { 'clients.read': 'Kunden anzeigen', 'shipments.read': 'Sendungen anzeigen', 'shipments.manage': 'Sendungen verwalten', 'tickets.read': 'Tickets anzeigen', 'tickets.manage': 'Tickets verwalten', 'webmail.read': 'Webmail lesen', 'webmail.send': 'Webmail senden', 'reports.read': 'Berichte anzeigen' }
  }
};

function emptyForm(): StaffForm {
  return { name: '', email: '', phone: '', title: 'Soporte DoorDrop', password: '', status: 'active', permissions: [...defaultPermissions] };
}

function formatDate(value: string | null | undefined, language: string, fallback: string) {
  if (!value) return fallback;
  try { return new Intl.DateTimeFormat(language || 'es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch { return value; }
}

export default function Staff() {
  const { language } = useI18n();
  const copy = copyByLanguage[language?.split('-')[0]] || copyByLanguage.es;
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<StaffForm>(emptyForm);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const activeCount = useMemo(() => staff.filter((member) => member.status === 'active').length, [staff]);
  const suspendedCount = useMemo(() => staff.filter((member) => member.status === 'suspended').length, [staff]);

  const loadStaff = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getAdminStaff();
      setStaff(Array.isArray(result?.staff) ? result.staff : []);
    } catch (requestError: any) {
      setError(requestError?.message || copy.failed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadStaff(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setError('');
    setNotice('');
    setModalOpen(true);
  };

  const openEdit = (member: StaffMember) => {
    setEditing(member);
    setForm({ name: member.name || '', email: member.email || '', phone: member.phone || '', title: member.title || 'Soporte DoorDrop', password: '', status: member.status || 'active', permissions: [...(member.permissions || [])] });
    setError('');
    setNotice('');
    setModalOpen(true);
  };

  const closeModal = () => {
    if (!working) setModalOpen(false);
  };

  const togglePermission = (permission: PermissionKey) => {
    setForm((current) => ({ ...current, permissions: current.permissions.includes(permission) ? current.permissions.filter((item) => item !== permission) : [...current.permissions, permission] }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!form.name.trim() || !form.email.trim() || (!editing && form.password.length < 12)) {
      setError(!editing && form.password.length < 12 ? copy.passwordRequired : copy.required);
      return;
    }
    setWorking(true);
    try {
      const payload: any = { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), title: form.title.trim(), status: form.status, permissions: form.permissions };
      if (form.password) payload.password = form.password;
      const result = editing ? await api.updateAdminStaff(editing.id, payload) : await api.createAdminStaff({ ...payload, password: form.password });
      if (result?.staff) setStaff((current) => editing ? current.map((item) => item.id === editing.id ? result.staff : item) : [result.staff, ...current]);
      setNotice(result?.message || copy.saved);
      setModalOpen(false);
    } catch (requestError: any) {
      setError(requestError?.message || copy.failed);
    } finally {
      setWorking(false);
    }
  };

  const changeStatus = async (member: StaffMember) => {
    const nextStatus: StaffMember['status'] = member.status === 'active' ? 'suspended' : 'active';
    const confirmed = window.confirm(member.status === 'active' ? copy.confirmSuspend : copy.confirmActivate);
    if (!confirmed) return;
    setWorking(true);
    setError('');
    try {
      const result = await api.updateAdminStaff(member.id, { status: nextStatus });
      if (result?.staff) setStaff((current) => current.map((item) => item.id === member.id ? result.staff : item));
      setNotice(result?.message || copy.saved);
    } catch (requestError: any) {
      setError(requestError?.message || copy.failed);
    } finally {
      setWorking(false);
    }
  };

  const statusLabel = (status: StaffMember['status']) => status === 'active' ? copy.statusActive : status === 'suspended' ? copy.statusSuspended : copy.statusClosed;
  const statusClass = (status: StaffMember['status']) => status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : status === 'suspended' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

  return (
    <div className="min-h-full bg-slate-50 p-4 text-slate-900 dark:bg-dark-900 dark:text-white sm:p-6 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><ShieldCheck className="h-4 w-4" /> {copy.eyebrow}</div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{copy.title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{copy.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void loadStaff()} disabled={loading || working} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-dark-800 dark:hover:bg-dark-700"><Users className="h-4 w-4" /> {copy.refresh}</button>
            <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-md hover:bg-blue-700"><UserPlus className="h-4 w-4" /> {copy.newMember}</button>
          </div>
        </div>

        {notice && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{notice}</div>}
        {error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[[copy.total, staff.length, 'text-slate-900 dark:text-white'], [copy.active, activeCount, 'text-emerald-600 dark:text-emerald-300'], [copy.suspended, suspendedCount, 'text-amber-600 dark:text-amber-300']].map(([label, value, className]) => <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-dark-800"><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-2 text-3xl font-black ${className}`}>{value}</p></div>)}
        </div>

        {loading ? <div className="flex min-h-[260px] items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-400 dark:border-slate-700 dark:bg-dark-800"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {copy.loading}</div> : staff.length === 0 ? <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 text-center dark:border-slate-700 dark:bg-dark-800"><Users className="mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" /><h2 className="text-xl font-black">{copy.emptyTitle}</h2><p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{copy.emptyText}</p><button onClick={openNew} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> {copy.newMember}</button></div> : <div className="grid gap-4 xl:grid-cols-2">
          {staff.map((member) => <article key={member.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-dark-800 sm:p-6">
            <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-lg font-black text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">{member.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><h2 className="truncate text-lg font-black">{member.name}</h2><p className="truncate text-sm text-slate-500 dark:text-slate-400">{member.title}</p></div></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${statusClass(member.status)}`}>{statusLabel(member.status)}</span></div>
            <div className="mt-5 grid gap-2 text-sm text-slate-600 dark:text-slate-300"><p className="flex min-w-0 items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate">{member.email}</span></p>{member.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-slate-400" />{member.phone}</p>}<p className="text-xs text-slate-400">{member.lastLoginAt ? `${copy.lastLogin}: ${formatDate(member.lastLoginAt, language, copy.never)}` : copy.never}</p></div>
            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-700"><div className="mb-3 flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-wider text-slate-400">{copy.role}</span><span className="text-xs font-bold text-slate-500 dark:text-slate-400">{member.permissions.length} {copy.permissions}</span></div><div className="flex flex-wrap gap-2">{member.permissions.length ? member.permissions.slice(0, 5).map((permission) => <span key={permission} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{copy.permissionLabels[permission]}</span>) : <span className="text-xs text-slate-400">{copy.noPermission}</span>}{member.permissions.length > 5 && <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">+{member.permissions.length - 5}</span>}</div></div>
            <div className="mt-5 flex flex-wrap justify-end gap-2"><button onClick={() => openEdit(member)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><Edit3 className="h-4 w-4" /> {copy.edit}</button><button onClick={() => void changeStatus(member)} disabled={working || member.status === 'closed'} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black disabled:opacity-50 ${member.status === 'active' ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>{member.status === 'active' ? copy.suspend : copy.activate}</button></div>
          </article>)}
        </div>}

        <p className="mt-5 text-xs text-slate-400">{copy.security}</p>
      </div>

      {modalOpen && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-6"><div className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-dark-800 sm:rounded-3xl sm:p-7"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">{copy.eyebrow}</p><h2 className="mt-1 text-2xl font-black">{editing ? copy.formEdit : copy.formNew}</h2></div><button onClick={closeModal} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-5 w-5" /></button></div><form onSubmit={save} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">{copy.name}<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-dark-900" maxLength={191} /></label><label className="block text-sm font-bold">{copy.email}<input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} type="email" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-dark-900" maxLength={191} autoComplete="off" /></label><label className="block text-sm font-bold">{copy.phone}<input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-dark-900" maxLength={50} /></label><label className="block text-sm font-bold">{copy.titleField}<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-dark-900" maxLength={120} /></label><label className="block text-sm font-bold sm:col-span-2">{copy.password}<span className="ml-2 text-xs font-normal text-slate-400">{copy.passwordHint}</span><div className="relative mt-2"><KeyRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} type="password" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-dark-900" minLength={editing ? 0 : 12} autoComplete="new-password" /></div></label>{editing && <label className="block text-sm font-bold">Estado<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as StaffMember['status'] }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-dark-900"><option value="active">{copy.statusActive}</option><option value="suspended">{copy.statusSuspended}</option><option value="closed">{copy.statusClosed}</option></select></label>}</div><div><p className="mb-3 text-sm font-black">{copy.selectPermissions}</p><div className="grid gap-2 sm:grid-cols-2">{permissionKeys.map((permission) => { const selected = form.permissions.includes(permission); return <button type="button" key={permission} onClick={() => togglePermission(permission)} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${selected ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200' : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900'}`}><span>{copy.permissionLabels[permission]}</span>{selected && <Check className="h-4 w-4 shrink-0" />}</button>; })}</div></div><div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5 dark:border-slate-700"><button type="button" onClick={closeModal} disabled={working} className="rounded-xl px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">{copy.cancel}</button><button type="submit" disabled={working} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editing ? copy.update : copy.save}</button></div></form></div></div>}
    </div>
  );
}
