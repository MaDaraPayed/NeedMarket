import { useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import {
  CATEGORIES,
  PLATFORMS,
  FORMATS,
  AUDIENCE_GENDER_LABELS,
  BLOGGER_TIER_LABELS,
  deriveTier,
  type AudienceGender,
  type CollabFormat,
} from '@needmarket/shared';
import {
  updateProfile,
  uploadBloggerAvatar,
  uploadSupportFile,
  resolveMediaUrl,
  type ApiUser,
  type BloggerProfile,
  type LinkedAccount,
  type LogoContentType,
} from '../api';
import { useMainButton } from '../useMainButton';
import { isMockEnv } from '../mockEnv';
import { Button } from '../components/Button';
import { SelectChip } from '../components/SelectChip';
import {
  FormSection,
  TextField,
  FormTextarea,
  BudgetRow,
  DateRow,
} from '../components/FormControls';

// ─── helpers ────────────────────────────────────────────────

const AVATAR_TYPES: LogoContentType[] = ['image/png', 'image/jpeg', 'image/webp'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      resolve(r.slice(r.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function numStr(v: number | null | undefined): string {
  return v != null ? String(v) : '';
}

function toNum(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

interface AccountRow {
  platform: string;
  url: string;
  followers: string;
}

function toRows(p: BloggerProfile | null): AccountRow[] {
  if (!p || p.linkedAccounts.length === 0) return [{ platform: '', url: '', followers: '' }];
  return p.linkedAccounts.map((a) => ({
    platform: a.platform,
    url: a.url,
    followers: a.followers != null ? String(a.followers) : '',
  }));
}

// ─── profile completion ──────────────────────────────────────
// Весовая шкала: max 100 баллов.
export function computeProfileCompletion(p: BloggerProfile): number {
  let s = 0;
  if (p.displayName?.trim()) s += 10;
  if (p.city?.trim()) s += 10;
  if ((p.categories ?? []).length > 0) s += 10;
  if ((p.linkedAccounts ?? []).some((a) => a.platform && a.url)) s += 10;
  if (p.bio?.trim()) s += 8;
  if (p.audienceGender) s += 7;
  if (p.audienceAge?.trim() || p.audienceGeo?.trim()) s += 5;
  if (p.reachStories != null || p.reachReels != null || p.reachPosts != null) s += 8;
  if (p.engagementRate != null) s += 7;
  if ((p.formats ?? []).length > 0) s += 10;
  const prices = [
    p.priceStories, p.priceStoriesSeries, p.priceReels,
    p.pricePost, p.priceEvent, p.priceUgc,
  ];
  if (prices.some((x) => x != null)) s += 10;
  if (p.brandsWorkedWith?.trim() || p.bestCaseUrl?.trim()) s += 5;
  return s; // max 100
}

// ─── select style ────────────────────────────────────────────
const selectStyle: React.CSSProperties = {
  width: '100%',
  appearance: 'none',
  WebkitAppearance: 'none',
  background: 'var(--nm-surface)',
  border: '1px solid var(--nm-line)',
  borderRadius: 'var(--nm-r-field)',
  padding: '13px 14px',
  fontSize: 15,
  color: 'var(--nm-ink)',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

// ─── toggle ──────────────────────────────────────────────────
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = label.replace(/\s/g, '_');
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        cursor: 'pointer',
        marginBottom: 16,
        padding: '10px 0',
        borderBottom: '1px solid var(--nm-line)',
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--nm-ink)' }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 2 }}>{hint}</div>
        )}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 44,
          height: 24,
          flexShrink: 0,
          cursor: 'pointer',
          accentColor: 'var(--nm-blue)',
        }}
      />
    </label>
  );
}

// ─── main component ─────────────────────────────────────────

export function BloggerEditProfile({
  token,
  user,
  onSaved,
  onCancel,
}: {
  token: string;
  user: ApiUser;
  onSaved: (user: ApiUser) => void;
  onCancel?: () => void;
}) {
  const existing = user.profile as BloggerProfile | null;

  // ── Основное ─────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [birthDate, setBirthDate] = useState(existing?.birthDate?.slice(0, 10) ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');

  // ── Аватар ───────────────────────────────────────────────
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(existing?.avatarUrl ?? null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [pickedAvatar, setPickedAvatar] = useState<File | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // ── Соцсети ───────────────────────────────────────────────
  const [accounts, setAccounts] = useState<AccountRow[]>(toRows(existing));

  // ── Тематика ──────────────────────────────────────────────
  const [categories, setCategories] = useState<string[]>(existing?.categories ?? []);
  const [bio, setBio] = useState(existing?.bio ?? '');

  // ── Аудитория ─────────────────────────────────────────────
  const [audienceGender, setAudienceGender] = useState<AudienceGender | null>(
    existing?.audienceGender ?? null,
  );
  const [audienceAge, setAudienceAge] = useState(existing?.audienceAge ?? '');
  const [audienceGeo, setAudienceGeo] = useState(existing?.audienceGeo ?? '');
  const [audienceLanguage, setAudienceLanguage] = useState(existing?.audienceLanguage ?? '');

  // ── Статистика ────────────────────────────────────────────
  const [reachStories, setReachStories] = useState(numStr(existing?.reachStories));
  const [reachReels, setReachReels] = useState(numStr(existing?.reachReels));
  const [reachPosts, setReachPosts] = useState(numStr(existing?.reachPosts));
  const [engagementRate, setEngagementRate] = useState(numStr(existing?.engagementRate));
  const [statsUrl, setStatsUrl] = useState(existing?.statsScreenshotUrl ?? '');
  const statsInputRef = useRef<HTMLInputElement>(null);
  const [statsUploadBusy, setStatsUploadBusy] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // ── Форматы ───────────────────────────────────────────────
  const [formats, setFormats] = useState<CollabFormat[]>(
    (existing?.formats ?? []) as CollabFormat[],
  );

  // ── Стоимость ─────────────────────────────────────────────
  const [priceStories, setPriceStories] = useState(numStr(existing?.priceStories));
  const [priceStoriesSeries, setPriceStoriesSeries] = useState(
    numStr(existing?.priceStoriesSeries),
  );
  const [priceReels, setPriceReels] = useState(numStr(existing?.priceReels));
  const [pricePost, setPricePost] = useState(numStr(existing?.pricePost));
  const [priceEvent, setPriceEvent] = useState(numStr(existing?.priceEvent));
  const [priceUgc, setPriceUgc] = useState(numStr(existing?.priceUgc));
  const [avgPrice3m, setAvgPrice3m] = useState(numStr(existing?.avgPrice3m));

  // ── Опыт ─────────────────────────────────────────────────
  const [brandsWorkedWith, setBrandsWorkedWith] = useState(existing?.brandsWorkedWith ?? '');
  const [bestCaseUrl, setBestCaseUrl] = useState(existing?.bestCaseUrl ?? '');

  // ── Прочее ───────────────────────────────────────────────
  const [barterAvailable, setBarterAvailable] = useState(existing?.barterAvailable ?? false);
  const [travelAvailable, setTravelAvailable] = useState(existing?.travelAvailable ?? false);
  const [preferredAdvertiserCategories, setPreferredAdvertiserCategories] = useState<string[]>(
    existing?.preferredAdvertiserCategories ?? [],
  );

  // ── Согласия ─────────────────────────────────────────────
  const [marketingOptIn, setMarketingOptIn] = useState(existing?.marketingOptIn ?? false);

  // ── Common state ─────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── account helpers ────────────────────────────────────

  function updateAccount(i: number, patch: Partial<AccountRow>) {
    setAccounts((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function addAccount() {
    setAccounts((prev) => [...prev, { platform: '', url: '', followers: '' }]);
  }

  function removeAccount(i: number) {
    setAccounts((prev) => prev.filter((_, idx) => idx !== i));
  }

  function toggleCategory(c: string) {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  function toggleFormat(f: CollabFormat) {
    setFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  function togglePreferredCat(c: string) {
    setPreferredAdvertiserCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  }

  // ─── avatar upload ───────────────────────────────────────

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
    setPickedAvatar(file);
    setLocalPreview(URL.createObjectURL(file));
  }

  async function uploadAvatar() {
    if (!pickedAvatar || avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const base64 = await fileToBase64(pickedAvatar);
      const updated = await uploadBloggerAvatar(token, pickedAvatar.type as LogoContentType, base64);
      const updatedProfile = updated.profile as BloggerProfile | null;
      setAvatarUrl(updatedProfile?.avatarUrl ?? null);
      setPickedAvatar(null);
      setLocalPreview(null);
    } catch (e) {
      setAvatarError((e as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  // ─── stats screenshot upload ─────────────────────────────

  async function uploadStatsFile(file: File) {
    setStatsError(null);
    setStatsUploadBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const { fileId } = await uploadSupportFile(token, file.type, base64, file.name);
      // Construct absolute URL so it passes z.string().url() validation on backend.
      const apiBase =
        (import.meta.env.VITE_API_URL as string | undefined) ?? window.location.origin;
      setStatsUrl(`${apiBase}/media/${fileId}`);
    } catch (e) {
      setStatsError((e as Error).message);
    } finally {
      setStatsUploadBusy(false);
    }
  }

  // ─── computed: tier ──────────────────────────────────────

  const maxFollowers = accounts.reduce<number | undefined>((mx, a) => {
    const n = a.followers.trim() === '' ? undefined : Number(a.followers);
    if (n == null || !Number.isFinite(n)) return mx;
    return mx == null ? n : Math.max(mx, n);
  }, undefined);

  const tier = deriveTier(maxFollowers);

  // ─── computed: completion % ──────────────────────────────

  const completion = computeProfileCompletion({
    ...(existing ?? ({} as BloggerProfile)),
    displayName,
    city,
    categories,
    linkedAccounts: accounts
      .filter((a) => a.platform.trim() && a.url.trim())
      .map((a) => {
        const acc: LinkedAccount = { platform: a.platform.trim(), url: a.url.trim() };
        const n = toNum(a.followers);
        if (n != null) acc.followers = n;
        return acc;
      }),
    bio: bio || null,
    audienceGender: audienceGender,
    audienceAge: audienceAge || null,
    audienceGeo: audienceGeo || null,
    reachStories: toNum(reachStories) ?? null,
    reachReels: toNum(reachReels) ?? null,
    reachPosts: toNum(reachPosts) ?? null,
    engagementRate: toNum(engagementRate) ?? null,
    formats,
    priceStories: toNum(priceStories) ?? null,
    priceStoriesSeries: toNum(priceStoriesSeries) ?? null,
    priceReels: toNum(priceReels) ?? null,
    pricePost: toNum(pricePost) ?? null,
    priceEvent: toNum(priceEvent) ?? null,
    priceUgc: toNum(priceUgc) ?? null,
    brandsWorkedWith: brandsWorkedWith || null,
    bestCaseUrl: bestCaseUrl || null,
  });

  // ─── save ────────────────────────────────────────────────

  const canSave = displayName.trim().length > 0 && !busy;

  async function save() {
    if (!canSave) return;

    const linkedAccounts: LinkedAccount[] = accounts
      .filter((a) => a.platform.trim() && a.url.trim())
      .map((a) => {
        const acc: LinkedAccount = { platform: a.platform.trim(), url: a.url.trim() };
        const n = toNum(a.followers);
        if (n != null) acc.followers = n;
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
        linkedAccounts,

        birthDate: birthDate || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,

        audienceGender: audienceGender ?? undefined,
        audienceAge: audienceAge.trim() || undefined,
        audienceGeo: audienceGeo.trim() || undefined,
        audienceLanguage: audienceLanguage.trim() || undefined,

        reachStories: toNum(reachStories),
        reachReels: toNum(reachReels),
        reachPosts: toNum(reachPosts),
        engagementRate: toNum(engagementRate),
        statsScreenshotUrl: statsUrl.trim() || undefined,

        formats,

        priceStories: toNum(priceStories),
        priceStoriesSeries: toNum(priceStoriesSeries),
        priceReels: toNum(priceReels),
        pricePost: toNum(pricePost),
        priceEvent: toNum(priceEvent),
        priceUgc: toNum(priceUgc),
        avgPrice3m: toNum(avgPrice3m),

        brandsWorkedWith: brandsWorkedWith.trim() || undefined,
        bestCaseUrl: bestCaseUrl.trim() || undefined,

        barterAvailable,
        travelAvailable,
        preferredAdvertiserCategories,

        marketingOptIn,
        termsAcceptedAt: existing?.termsAcceptedAt ?? undefined,
      });
      onSaved(updated);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  useMainButton({
    text: 'Сохранить',
    isEnabled: canSave,
    isVisible: true,
    isLoaderVisible: busy,
    onClick: () => void save(),
  });

  const previewSrc = localPreview ?? (avatarUrl ? resolveMediaUrl(avatarUrl) : null);

  // ─── render ──────────────────────────────────────────────

  return (
    <div style={{ padding: 16, paddingBottom: 48 }}>
      {/* Шапка */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 19,
            fontWeight: 800,
            color: 'var(--nm-ink)',
            letterSpacing: '-.3px',
          }}
        >
          Мой профиль
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
        )}
      </div>

      {/* Индикатор заполненности */}
      <CompletionBar pct={completion} />

      {/* ── 1. Основное ─────────────────────────────────── */}
      <FormSection title="Основное" first>
        {/* Аватар */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div
            style={{
              width: 72,
              height: 72,
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
              <img
                src={previewSrc}
                alt="Аватар"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <UserRound size={28} color="var(--nm-ink-3)" aria-hidden />
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
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarBusy}
            >
              {previewSrc ? 'Заменить фото' : 'Добавить фото'}
            </Button>
            {pickedAvatar && (
              <Button
                variant="fill"
                size="sm"
                disabled={avatarBusy}
                onClick={() => void uploadAvatar()}
              >
                {avatarBusy ? 'Загружаем...' : 'Загрузить'}
              </Button>
            )}
          </div>
        </div>
        {avatarError && (
          <div style={{ color: 'var(--nm-red)', fontSize: 13, marginBottom: 12 }}>{avatarError}</div>
        )}

        <TextField
          label="Имя / название блога"
          placeholder="Например, Алиса о бьюти"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <TextField
          label="Город"
          optional
          placeholder="Алматы"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <DateRow
          label="Дата рождения"
          value={birthDate}
          onChange={setBirthDate}
        />
        <TextField
          label="Телефон"
          optional
          type="tel"
          inputMode="tel"
          placeholder="+7..."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <TextField
          label="Email"
          optional
          type="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormSection>

      {/* ── 2. Соцсети ──────────────────────────────────── */}
      <FormSection title="Соцсети">
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
            <div style={{ marginBottom: 15 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--nm-ink-2)',
                  marginBottom: 8,
                }}
              >
                Платформа
              </label>
              <select
                value={a.platform}
                onChange={(e) => updateAccount(i, { platform: e.target.value })}
                style={selectStyle}
              >
                <option value="">Выберите платформу</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
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
              placeholder="например, 12 000"
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
                Удалить
              </Button>
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addAccount}>
          + Добавить аккаунт
        </Button>

        {/* Tier badge */}
        {tier && (
          <div
            style={{
              marginTop: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--nm-blue-soft)',
              border: '1px solid var(--nm-blue-line)',
              borderRadius: 'var(--nm-r-pill)',
              padding: '6px 14px',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--nm-ink-3)' }}>Ваш тир:</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--nm-blue-strong)' }}>
              {BLOGGER_TIER_LABELS[tier]}
            </span>
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 10 }}>
          Тир рассчитывается автоматически по числу подписчиков
        </div>
      </FormSection>

      {/* ── 3. Тематика ─────────────────────────────────── */}
      <FormSection title="Тематика">
        <FormTextarea
          label="О блоге"
          optional
          placeholder="Тематика, формат, что предлагаете брендам"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
        />
        <div style={{ marginBottom: 8 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--nm-ink-2)',
              marginBottom: 10,
            }}
          >
            Категории
          </label>
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
        </div>
      </FormSection>

      {/* ── 4. Аудитория ────────────────────────────────── */}
      <FormSection title="Аудитория">
        <div style={{ marginBottom: 15 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--nm-ink-2)',
              marginBottom: 10,
            }}
          >
            Пол аудитории{' '}
            <em style={{ fontStyle: 'normal', color: 'var(--nm-ink-3)', fontWeight: 500 }}>
              · необязательно
            </em>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(Object.entries(AUDIENCE_GENDER_LABELS) as [AudienceGender, string][]).map(
              ([val, lbl]) => (
                <SelectChip
                  key={val}
                  label={lbl}
                  selected={audienceGender === val}
                  onClick={() => setAudienceGender(audienceGender === val ? null : val)}
                />
              ),
            )}
          </div>
        </div>
        <TextField
          label="Возраст аудитории"
          optional
          placeholder="например, 18–34"
          value={audienceAge}
          onChange={(e) => setAudienceAge(e.target.value)}
        />
        <TextField
          label="География аудитории"
          optional
          placeholder="например, Казахстан 70%, Россия 20%"
          value={audienceGeo}
          onChange={(e) => setAudienceGeo(e.target.value)}
        />
        <TextField
          label="Язык аудитории"
          optional
          placeholder="Русский, Казахский..."
          value={audienceLanguage}
          onChange={(e) => setAudienceLanguage(e.target.value)}
        />
      </FormSection>

      {/* ── 5. Статистика ───────────────────────────────── */}
      <FormSection title="Статистика">
        <TextField
          label="Охват Stories (средний)"
          optional
          type="number"
          inputMode="numeric"
          placeholder="например, 5000"
          value={reachStories}
          onChange={(e) => setReachStories(e.target.value)}
        />
        <TextField
          label="Охват Reels (средний)"
          optional
          type="number"
          inputMode="numeric"
          placeholder="например, 20000"
          value={reachReels}
          onChange={(e) => setReachReels(e.target.value)}
        />
        <TextField
          label="Охват постов (средний)"
          optional
          type="number"
          inputMode="numeric"
          placeholder="например, 8000"
          value={reachPosts}
          onChange={(e) => setReachPosts(e.target.value)}
        />
        <TextField
          label="ER % (вовлечённость)"
          optional
          type="number"
          inputMode="decimal"
          placeholder="например, 4.5"
          value={engagementRate}
          onChange={(e) => setEngagementRate(e.target.value)}
        />

        {/* Скриншот статистики */}
        <div style={{ marginBottom: 15 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--nm-ink-2)',
              marginBottom: 8,
            }}
          >
            Скриншот статистики{' '}
            <em style={{ fontStyle: 'normal', color: 'var(--nm-ink-3)', fontWeight: 500 }}>
              · необязательно
            </em>
          </label>
          <input
            ref={statsInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadStatsFile(f);
              e.target.value = '';
            }}
          />
          {statsUrl ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: 'var(--nm-blue-soft)',
                border: '1px solid var(--nm-blue-line)',
                borderRadius: 'var(--nm-r-card)',
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: 'var(--nm-blue-strong)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                Скриншот загружен
              </span>
              <Button
                variant="ghost"
                size="sm"
                style={{ color: 'var(--nm-red)', borderColor: 'transparent', flexShrink: 0 }}
                onClick={() => setStatsUrl('')}
              >
                Удалить
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={statsUploadBusy}
              onClick={() => statsInputRef.current?.click()}
              style={{ width: '100%' }}
            >
              {statsUploadBusy ? 'Загружаем...' : '+ Прикрепить скриншот'}
            </Button>
          )}
          {statsError && (
            <div style={{ color: 'var(--nm-red)', fontSize: 13, marginTop: 6 }}>{statsError}</div>
          )}
        </div>
      </FormSection>

      {/* ── 6. Форматы ──────────────────────────────────── */}
      <FormSection title="Форматы сотрудничества">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {FORMATS.map(({ value, label }) => (
            <SelectChip
              key={value}
              label={label}
              selected={formats.includes(value)}
              onClick={() => toggleFormat(value)}
            />
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 10 }}>
          Отметьте все подходящие форматы
        </div>
      </FormSection>

      {/* ── 7. Стоимость ────────────────────────────────── */}
      <FormSection title="Стоимость (тенге)">
        <BudgetRow label="Stories" value={priceStories} onChange={setPriceStories} placeholder="за 1 Stories" />
        <BudgetRow label="Серия Stories" value={priceStoriesSeries} onChange={setPriceStoriesSeries} placeholder="за серию" />
        <BudgetRow label="Reels" value={priceReels} onChange={setPriceReels} placeholder="за 1 Reels" />
        <BudgetRow label="Пост" value={pricePost} onChange={setPricePost} placeholder="за пост" />
        <BudgetRow label="Мероприятие" value={priceEvent} onChange={setPriceEvent} placeholder="за участие" />
        <BudgetRow label="UGC" value={priceUgc} onChange={setPriceUgc} placeholder="за UGC-контент" />
        <BudgetRow label="Средний за 3 мес." value={avgPrice3m} onChange={setAvgPrice3m} placeholder="среднее за последние 3 мес." />
      </FormSection>

      {/* ── 8. Опыт ─────────────────────────────────────── */}
      <FormSection title="Опыт">
        <FormTextarea
          label="Бренды, с которыми работали"
          optional
          placeholder="Nike, Kaspi, Samsung..."
          value={brandsWorkedWith}
          onChange={(e) => setBrandsWorkedWith(e.target.value)}
          rows={2}
        />
        <TextField
          label="Лучший кейс (ссылка)"
          optional
          placeholder="https://..."
          value={bestCaseUrl}
          onChange={(e) => setBestCaseUrl(e.target.value)}
        />
      </FormSection>

      {/* ── 9. Прочее ────────────────────────────────────── */}
      <FormSection title="Прочее">
        <Toggle
          label="Принимаю бартер"
          hint="Согласны на оплату товарами/услугами"
          checked={barterAvailable}
          onChange={setBarterAvailable}
        />
        <Toggle
          label="Готов к выезду"
          hint="Могу работать в других городах"
          checked={travelAvailable}
          onChange={setTravelAvailable}
        />
        <div style={{ marginTop: 4 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--nm-ink-2)',
              marginBottom: 10,
            }}
          >
            Предпочитаемые категории рекламодателей{' '}
            <em style={{ fontStyle: 'normal', color: 'var(--nm-ink-3)', fontWeight: 500 }}>
              · необязательно
            </em>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORIES.map((c) => (
              <SelectChip
                key={c}
                label={c}
                selected={preferredAdvertiserCategories.includes(c)}
                onClick={() => togglePreferredCat(c)}
              />
            ))}
          </div>
        </div>
      </FormSection>

      {/* ── 10. Согласия ─────────────────────────────────── */}
      <FormSection title="Согласия">
        <Toggle
          label="Получать рекламные предложения"
          hint="Рекламодатели смогут предложить вам сотрудничество напрямую"
          checked={marketingOptIn}
          onChange={setMarketingOptIn}
        />
        {existing?.termsAcceptedAt ? (
          <div
            style={{
              fontSize: 13,
              color: 'var(--nm-ink-2)',
              padding: '10px 0',
            }}
          >
            Условия NeedMarket приняты{' '}
            <span style={{ color: 'var(--nm-ink-3)' }}>
              {new Date(existing.termsAcceptedAt).toLocaleDateString('ru-RU')}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--nm-ink-3)', padding: '10px 0' }}>
            Условия не приняты
          </div>
        )}
      </FormSection>

      {error && (
        <div style={{ color: 'var(--nm-red)', fontSize: 13, marginTop: 12, paddingLeft: 4 }}>
          {error}
        </div>
      )}

      {/* Fallback «Сохранить» только в браузере (dev); в Telegram — нативный MainButton */}
      {isMockEnv && (
        <div style={{ marginTop: 24 }}>
          <Button
            variant="fill"
            disabled={!canSave}
            onClick={() => void save()}
            style={{ width: '100%' }}
          >
            {busy ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      )}

      {/* «Отмена» — всегда вторичная, MainButton её не дублирует */}
      {onCancel && (
        <div style={{ marginTop: isMockEnv ? 8 : 24 }}>
          <Button variant="ghost" style={{ width: '100%' }} onClick={onCancel} disabled={busy}>
            Отмена
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── CompletionBar ────────────────────────────────────────────

function CompletionBar({ pct }: { pct: number }) {
  const color =
    pct >= 80 ? 'var(--nm-blue)' : pct >= 40 ? '#f5a623' : 'var(--nm-red)';
  return (
    <div
      style={{
        marginBottom: 20,
        padding: '12px 14px',
        background: 'var(--nm-surface)',
        border: '1px solid var(--nm-line)',
        borderRadius: 'var(--nm-r-card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--nm-ink)' }}>
          Заполненность профиля
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, color }}>{pct}%</span>
      </div>
      <div
        style={{
          height: 6,
          background: 'var(--nm-line)',
          borderRadius: 99,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: 99,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      {pct < 80 && (
        <div style={{ fontSize: 12, color: 'var(--nm-ink-3)', marginTop: 7 }}>
          {pct < 40
            ? 'Заполните профиль — рекламодатели не видят неполные анкеты'
            : 'Добавьте статистику, форматы и цены — вы получите больше заявок'}
        </div>
      )}
    </div>
  );
}
