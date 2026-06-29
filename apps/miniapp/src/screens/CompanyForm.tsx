import { useRef, useState } from 'react';
import { requestContact } from '@tma.js/sdk-react';
import { Building2 } from 'lucide-react';
import {
  updateProfile,
  uploadCompanyLogo,
  resolveMediaUrl,
  type ApiUser,
  type CompanyProfile,
  type LogoContentType,
} from '../api';
import { useMainButton } from '../useMainButton';
import { isMockEnv } from '../mockEnv';
import { Button } from '../components/Button';
import { SelectChip } from '../components/SelectChip';
import { FormSection, TextField, FormHint } from '../components/FormControls';

const LOGO_TYPES: LogoContentType[] = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

type ContactType = 'username' | 'phone' | 'other';

function inferContactType(contact: string): ContactType {
  if (contact.startsWith('@')) return 'username';
  if (/^[+\d][\d\s()-]+$/.test(contact)) return 'phone';
  return contact ? 'other' : 'username';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function CompanyForm({
  token,
  user,
  onSaved,
  onUserPatched,
  onCancel,
}: {
  token: string;
  user: ApiUser;
  onSaved: (user: ApiUser) => void;
  onUserPatched: (user: ApiUser) => void;
  onCancel?: () => void;
}) {
  const existing = user.profile as CompanyProfile | null;
  const defaultContact = existing?.contact ?? (user.username ? `@${user.username}` : '');
  const [name, setName] = useState(existing?.name ?? '');
  const [sphere, setSphere] = useState(existing?.sphere ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [contact, setContact] = useState(defaultContact);
  const [contactType, setContactType] = useState<ContactType>(
    inferContactType(existing?.contact ?? defaultContact),
  );
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [contactHint, setContactHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const usernameContact = user.username ? `@${user.username}` : '';

  async function requestPhoneFromTelegram() {
    if (phoneBusy) return;
    setContactHint(null);
    if (!requestContact.isAvailable()) {
      setContactHint('Запрос номера недоступен — введите телефон вручную.');
      return;
    }
    setPhoneBusy(true);
    try {
      const res = await requestContact();
      const raw = res.contact?.phone_number;
      if (raw) {
        setContact(raw.startsWith('+') ? raw : `+${raw}`);
      } else {
        setContactHint('Telegram не вернул номер — введите его вручную.');
      }
    } catch {
      setContactHint('Доступ к номеру не выдан — введите телефон вручную.');
    } finally {
      setPhoneBusy(false);
    }
  }

  function switchContactType(next: ContactType) {
    setContactType(next);
    setContactHint(null);
    if (next === 'username') {
      if (usernameContact && (!contact || inferContactType(contact) !== 'other')) {
        setContact(usernameContact);
      }
    } else if (next === 'phone') {
      void requestPhoneFromTelegram();
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(existing?.logoUrl ?? null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const canSave = name.trim().length > 0;

  const missing: string[] = [];
  if (!name.trim()) missing.push('Название рекламодателя');

  function pickFile(file: File | undefined) {
    setLogoError(null);
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type as LogoContentType)) {
      setLogoError('Только PNG, JPEG или WebP');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError('Файл больше 5 МБ');
      return;
    }
    setPickedFile(file);
    setLocalPreview(URL.createObjectURL(file));
  }

  async function uploadLogo() {
    if (!pickedFile || logoBusy) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      const base64 = await fileToBase64(pickedFile);
      const updated = await uploadCompanyLogo(token, pickedFile.type as LogoContentType, base64);
      const updatedProfile = updated.profile as CompanyProfile | null;
      setLogoUrl(updatedProfile?.logoUrl ?? null);
      setPickedFile(null);
      setLocalPreview(null);
      onUserPatched(updated);
    } catch (e) {
      setLogoError((e as Error).message);
    } finally {
      setLogoBusy(false);
    }
  }

  function handleSubmit() {
    if (!canSave) { setSubmitted(true); return; }
    void save();
  }

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateProfile(token, {
        name: name.trim(),
        sphere: sphere.trim() || undefined,
        city: city.trim() || undefined,
        contact: contact.trim() || undefined,
      });
      onSaved(updated);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  useMainButton({
    text: existing ? 'Сохранить' : 'Продолжить',
    isEnabled: !busy,
    isVisible: true,
    isLoaderVisible: busy,
    onClick: handleSubmit,
  });

  const previewSrc = localPreview ?? (logoUrl ? resolveMediaUrl(logoUrl) : null);

  return (
    <div style={{ padding: 16, paddingBottom: 32 }}>
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--nm-ink)', letterSpacing: '-.3px' }}>
          {existing ? 'Профиль рекламодателя' : 'Расскажите о рекламодателе'}
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
        )}
      </div>

      {/* О рекламодателе */}
      <FormSection title="О рекламодателе" first>
        <TextField
          label="Название"
          placeholder="ООО Ромашка"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Сфера"
          optional
          placeholder="Косметика, общепит, услуги..."
          value={sphere}
          onChange={(e) => setSphere(e.target.value)}
        />
        <TextField
          label="Город"
          optional
          placeholder="Астана"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </FormSection>

      {/* Логотип */}
      <FormSection title="Логотип">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
          <div
            style={{
              width: 80,
              height: 80,
              flexShrink: 0,
              borderRadius: 'var(--nm-r-tile)',
              overflow: 'hidden',
              background: 'var(--nm-surface-2)',
              border: '1px solid var(--nm-line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {previewSrc ? (
              <img src={previewSrc} alt="Логотип" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Building2 size={32} color="var(--nm-ink-3)" aria-hidden />
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={!existing || logoBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              {logoUrl || localPreview ? 'Заменить' : 'Выбрать изображение'}
            </Button>
            {pickedFile && (
              <Button variant="fill" size="sm" disabled={logoBusy} onClick={() => void uploadLogo()}>
                {logoBusy ? 'Загружаем...' : 'Загрузить'}
              </Button>
            )}
          </div>
        </div>
        {!existing && (
          <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 6 }}>
            Сохраните профиль — затем сможете добавить логотип
          </div>
        )}
        {existing && (
          <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 6 }}>
            PNG, JPEG или WebP, до 5 МБ
          </div>
        )}
        {logoError && (
          <div style={{ color: 'var(--nm-red)', fontSize: 13, marginTop: 6 }}>{logoError}</div>
        )}
      </FormSection>

      {/* Контакт */}
      <FormSection title="Контакт">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <SelectChip
            label="Username"
            selected={contactType === 'username'}
            onClick={() => switchContactType('username')}
          />
          <SelectChip
            label="Телефон"
            selected={contactType === 'phone'}
            onClick={() => switchContactType('phone')}
          />
          <SelectChip
            label="Другое"
            selected={contactType === 'other'}
            onClick={() => switchContactType('other')}
          />
        </div>
        <input
          className="nm-field-input"
          placeholder={
            contactType === 'phone'
              ? '+7...'
              : contactType === 'username'
                ? '@username'
                : 'Email, сайт, мессенджер...'
          }
          type={contactType === 'phone' ? 'tel' : 'text'}
          inputMode={contactType === 'phone' ? 'tel' : 'text'}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
        {contactType === 'phone' && (
          <div style={{ marginTop: 10 }}>
            <Button
              variant="ghost"
              size="sm"
              disabled={phoneBusy}
              onClick={() => void requestPhoneFromTelegram()}
            >
              {phoneBusy ? 'Запрашиваем...' : 'Получить номер из Telegram'}
            </Button>
          </div>
        )}
        {contactHint && (
          <div style={{ color: 'var(--nm-ink-2)', fontSize: 13, marginTop: 8 }}>{contactHint}</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 8 }}>
          Как с вами связаться после выбора блогера
        </div>
      </FormSection>

      <FormHint missing={submitted ? missing : []} />

      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 13, marginTop: 4, paddingLeft: 4 }}>{error}</div>
      )}

      {/* Fallback только в браузере (dev); в Telegram — нативный MainButton */}
      {isMockEnv && (
        <div style={{ marginTop: 20 }}>
          <Button
            variant="fill"
            disabled={busy}
            onClick={handleSubmit}
            style={{ width: '100%' }}
          >
            {busy ? 'Сохраняем...' : existing ? 'Сохранить' : 'Продолжить'}
          </Button>
        </div>
      )}

      {onCancel && (
        <div style={{ marginTop: isMockEnv ? 8 : 20 }}>
          <Button variant="ghost" style={{ width: '100%' }} onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
        </div>
      )}
    </div>
  );
}
