import { useRef, useState } from 'react';
import { requestContact } from '@tma.js/sdk-react';
import { UserRound } from 'lucide-react';
import { CATEGORIES } from '@needmarket/shared';
import {
  updateProfile,
  uploadBloggerAvatar,
  resolveMediaUrl,
  type ApiUser,
  type BloggerProfile,
  type LinkedAccount,
  type LogoContentType,
} from '../api';
import { useMainButton } from '../useMainButton';
import { Button } from '../components/Button';
import { SelectChip } from '../components/SelectChip';
import { FormSection, TextField, FormTextarea } from '../components/FormControls';

type ContactType = 'username' | 'phone' | 'other';

function inferContactType(contact: string): ContactType {
  if (contact.startsWith('@')) return 'username';
  if (/^[+\d][\d\s()-]+$/.test(contact)) return 'phone';
  return contact ? 'other' : 'username';
}

const AVATAR_TYPES: LogoContentType[] = ['image/png', 'image/jpeg', 'image/webp'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

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

interface AccountRow {
  platform: string;
  url: string;
  followers: string;
}

function toRows(profile: BloggerProfile | null): AccountRow[] {
  if (!profile || profile.linkedAccounts.length === 0) return [];
  return profile.linkedAccounts.map((a) => ({
    platform: a.platform,
    url: a.url,
    followers: a.followers != null ? String(a.followers) : '',
  }));
}

export function BloggerForm({
  token,
  user,
  onSaved,
  onUserPatched,
  onCancel,
}: {
  token: string;
  user: ApiUser;
  onSaved: (user: ApiUser) => void;
  onUserPatched?: (user: ApiUser) => void;
  onCancel?: () => void;
}) {
  const existing = user.profile as BloggerProfile | null;
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '');
  const [bio, setBio] = useState(existing?.bio ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [categories, setCategories] = useState<string[]>(existing?.categories ?? []);
  const [accounts, setAccounts] = useState<AccountRow[]>(toRows(existing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultContact = existing?.contact ?? (user.username ? `@${user.username}` : '');
  const [contact, setContact] = useState(defaultContact);
  const [contactType, setContactType] = useState<ContactType>(
    inferContactType(existing?.contact ?? defaultContact),
  );
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [contactHint, setContactHint] = useState<string | null>(null);

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

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(existing?.avatarUrl ?? null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  function pickAvatarFile(file: File | undefined) {
    setAvatarError(null);
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type as LogoContentType)) {
      setAvatarError('Только PNG, JPEG или WebP');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError('Файл больше 5 МБ');
      return;
    }
    setPickedFile(file);
    setLocalPreview(URL.createObjectURL(file));
  }

  async function uploadAvatar() {
    if (!pickedFile || avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const base64 = await fileToBase64(pickedFile);
      const updated = await uploadBloggerAvatar(token, pickedFile.type as LogoContentType, base64);
      const updatedProfile = updated.profile as BloggerProfile | null;
      setAvatarUrl(updatedProfile?.avatarUrl ?? null);
      setPickedFile(null);
      setLocalPreview(null);
      onUserPatched?.(updated);
    } catch (e) {
      setAvatarError((e as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  function toggleCategory(c: string) {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function updateAccount(i: number, patch: Partial<AccountRow>) {
    setAccounts((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function addAccount() {
    setAccounts((prev) => [...prev, { platform: '', url: '', followers: '' }]);
  }

  function removeAccount(i: number) {
    setAccounts((prev) => prev.filter((_, idx) => idx !== i));
  }

  const canSave = displayName.trim().length > 0;

  async function save() {
    if (!canSave || busy) {
      if (!canSave) setError('Укажите отображаемое имя');
      return;
    }
    const linkedAccounts: LinkedAccount[] = accounts
      .filter((a) => a.platform.trim() && a.url.trim())
      .map((a) => {
        const followers = a.followers.trim() === '' ? undefined : Number(a.followers);
        const acc: LinkedAccount = { platform: a.platform.trim(), url: a.url.trim() };
        if (followers != null && Number.isFinite(followers)) acc.followers = followers;
        return acc;
      });

    setBusy(true);
    setError(null);
    try {
      const updated = await updateProfile(token, {
        displayName: displayName.trim(),
        bio: bio.trim() || undefined,
        categories,
        city: city.trim() || undefined,
        contact: contact.trim() || undefined,
        linkedAccounts,
      });
      onSaved(updated);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  useMainButton({
    text: existing ? 'Сохранить' : 'Продолжить',
    isEnabled: canSave && !busy,
    isVisible: true,
    isLoaderVisible: busy,
    onClick: save,
  });

  const previewSrc = localPreview ?? (avatarUrl ? resolveMediaUrl(avatarUrl) : null);

  return (
    <div style={{ padding: 16, paddingBottom: 32 }}>
      {/* Шапка */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--nm-ink)', letterSpacing: '-.3px' }}>
          {existing ? 'Профиль блогера' : 'Расскажите о себе'}
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
        )}
      </div>

      {/* Основное */}
      <FormSection title="Основное" first>
        <TextField
          label="Имя / название блога"
          placeholder="Например, Алиса о бьюти"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <FormTextarea
          label="О себе"
          optional
          placeholder="Тематика, формат, что предлагаете брендам"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
        />
        <TextField
          label="Город"
          optional
          placeholder="Алматы"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </FormSection>

      {/* Аватар */}
      <FormSection title="Аватар">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
          <div
            style={{
              width: 80,
              height: 80,
              flexShrink: 0,
              borderRadius: '50%',
              overflow: 'hidden',
              background: 'var(--nm-surface-2)',
              border: '1px solid var(--nm-line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {previewSrc ? (
              <img src={previewSrc} alt="Аватар" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <UserRound size={32} color="var(--nm-ink-3)" aria-hidden />
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => pickAvatarFile(e.target.files?.[0])}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={!existing || avatarBusy}
              onClick={() => avatarInputRef.current?.click()}
            >
              {avatarUrl || localPreview ? 'Заменить' : 'Выбрать фото'}
            </Button>
            {pickedFile && (
              <Button variant="fill" size="sm" disabled={avatarBusy} onClick={() => void uploadAvatar()}>
                {avatarBusy ? 'Загружаем...' : 'Загрузить'}
              </Button>
            )}
          </div>
        </div>
        {!existing && (
          <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 6 }}>
            Сохраните профиль — затем сможете добавить аватар
          </div>
        )}
        {!existing && (
          <div style={{ fontSize: 12, color: 'var(--nm-ink-3)' }}>PNG, JPEG или WebP, до 5 МБ</div>
        )}
        {avatarError && (
          <div style={{ color: 'var(--nm-red)', fontSize: 13, marginTop: 6 }}>{avatarError}</div>
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
          Как с вами связаться после выбора на лот
        </div>
      </FormSection>

      {/* Категории */}
      <FormSection title="Категории">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map((c) => (
            <SelectChip
              key={c}
              label={c}
              selected={categories.includes(c)}
              onClick={() => toggleCategory(c)}
            />
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 10 }}>
          Выберите темы, в которых вы работаете
        </div>
      </FormSection>

      {/* Аккаунты */}
      <FormSection title="Аккаунты">
        {accounts.map((a, i) => (
          <div
            key={i}
            style={{
              marginBottom: 12,
              padding: '12px 14px 4px',
              background: 'var(--nm-surface)',
              border: '1px solid var(--nm-line)',
              borderRadius: 'var(--nm-r-card)',
            }}
          >
            <TextField
              label="Платформа"
              placeholder="Instagram, YouTube, TikTok..."
              value={a.platform}
              onChange={(e) => updateAccount(i, { platform: e.target.value })}
            />
            <TextField
              label="Ссылка"
              placeholder="https://..."
              value={a.url}
              onChange={(e) => updateAccount(i, { url: e.target.value })}
            />
            <TextField
              label="Подписчики"
              optional
              type="number"
              inputMode="numeric"
              placeholder="например, 12000"
              value={a.followers}
              onChange={(e) => updateAccount(i, { followers: e.target.value })}
            />
            <div style={{ marginBottom: 10 }}>
              <Button
                variant="ghost"
                size="sm"
                style={{ color: 'var(--nm-red)', borderColor: 'transparent' }}
                onClick={() => removeAccount(i)}
              >
                Удалить аккаунт
              </Button>
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addAccount}>
          + Добавить аккаунт
        </Button>
        <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 8 }}>
          Ссылки на ваши площадки (необязательно)
        </div>
      </FormSection>

      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 13, marginTop: 8, paddingLeft: 4 }}>{error}</div>
      )}

      {/* Действия */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        <Button
          variant="fill"
          disabled={!canSave || busy}
          onClick={() => void save()}
          style={{ width: '100%' }}
        >
          {busy ? 'Сохраняем...' : existing ? 'Сохранить' : 'Продолжить'}
        </Button>
        {onCancel && (
          <Button variant="ghost" style={{ width: '100%' }} onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
        )}
      </div>
    </div>
  );
}
