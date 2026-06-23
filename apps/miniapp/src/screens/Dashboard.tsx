import { useState } from 'react';
import { Home as HomeIcon, Send, Bookmark, LifeBuoy, User, ClipboardList, Plus } from 'lucide-react';
import type { ApiUser, BloggerProfile, CompanyProfile } from '../api';
import { useAuth } from '../AuthProvider';
import { BottomTabBar } from '../components/BottomTabBar';
import { ScreenHeader } from '../components/ScreenHeader';
import { ProfileView } from './ProfileView';
import { CompanyHome } from './lots/CompanyHome';
import { BloggerHome } from './lots/BloggerHome';
import { CreateLotForm } from './lots/CreateLotForm';
import { LotDetail } from './lots/LotDetail';
import { MyResponses } from './lots/MyResponses';
import { SavedSearches } from './lots/SavedSearches';
import { SupportList } from './support/SupportList';
import { SupportCreateForm } from './support/SupportCreateForm';
import { SupportThread } from './support/SupportThread';

type View =
  | { name: 'home' }
  | { name: 'profile' }
  | { name: 'myResponses' }
  | { name: 'savedSearches' }
  | { name: 'support' }
  | { name: 'createLot' }
  | { name: 'lot'; id: string }
  | { name: 'supportTicket'; id: string }
  | { name: 'supportCreate' };

const ROOT_VIEWS = new Set<View['name']>([
  'home', 'profile', 'myResponses', 'savedSearches', 'support',
]);

function getHeaderConfig(
  view: View,
  user: ApiUser,
): { title: string; subtitle?: string } {
  if (view.name === 'profile') {
    const isBlogger = user.role === 'blogger';
    const name = isBlogger
      ? ((user.profile as BloggerProfile)?.displayName ?? user.firstName)
      : ((user.profile as CompanyProfile)?.name ?? user.firstName);
    return { title: name, subtitle: isBlogger ? 'Профиль блогера' : 'Профиль компании' };
  }
  if (user.role === 'blogger') {
    if (view.name === 'home') return { title: 'Открытые проекты' };
    if (view.name === 'myResponses') return { title: 'Мои отклики' };
    if (view.name === 'savedSearches') return { title: 'Сохранённые поиски' };
    if (view.name === 'support') return { title: 'Поддержка' };
  } else {
    if (view.name === 'home') return { title: 'Ваши лоты' };
    if (view.name === 'support') return { title: 'Поддержка' };
  }
  return { title: '' };
}

export function Dashboard({
  user,
  token,
  onEditProfile,
  initialLotId,
  initialTicketId,
}: {
  user: ApiUser;
  token: string;
  onEditProfile: () => void;
  initialLotId?: string;
  initialTicketId?: string;
}) {
  const { setUser } = useAuth();
  const [view, setView] = useState<View>(() => {
    if (initialTicketId) return { name: 'supportTicket', id: initialTicketId };
    if (initialLotId) return { name: 'lot', id: initialLotId };
    return { name: 'home' };
  });
  const [lotsRefresh, setLotsRefresh] = useState(0);
  // Track which root view to return to when exiting a lot detail
  const [prevRoot, setPrevRoot] = useState<View>({ name: 'home' });

  const isRoot = ROOT_VIEWS.has(view.name);

  function goToLot(id: string) {
    if (ROOT_VIEWS.has(view.name)) setPrevRoot(view);
    setView({ name: 'lot', id });
  }

  function handleTabChange(key: string) {
    const bloggerMap: Partial<Record<string, View>> = {
      feed:      { name: 'home' },
      responses: { name: 'myResponses' },
      searches:  { name: 'savedSearches' },
      support:   { name: 'support' },
      profile:   { name: 'profile' },
    };
    const companyMap: Partial<Record<string, View>> = {
      home:    { name: 'home' },
      support: { name: 'support' },
      profile: { name: 'profile' },
      create:  { name: 'createLot' },
    };
    const map = user.role === 'blogger' ? bloggerMap : companyMap;
    const next = map[key];
    if (next) setView(next);
  }

  function renderContent() {
    if (view.name === 'profile') {
      return (
        <ProfileView
          user={user}
          token={token}
          onEdit={onEditProfile}
          onUserUpdated={setUser}
        />
      );
    }

    if (view.name === 'lot') {
      return (
        <LotDetail
          token={token}
          id={view.id}
          user={user}
          onBack={() => setView(prevRoot)}
        />
      );
    }

    if (view.name === 'support') {
      return (
        <SupportList
          token={token}
          onOpenTicket={(id) => setView({ name: 'supportTicket', id })}
          onCreateTicket={() => setView({ name: 'supportCreate' })}
        />
      );
    }

    if (view.name === 'supportTicket') {
      return (
        <SupportThread
          token={token}
          ticketId={view.id}
          onBack={() => setView({ name: 'support' })}
        />
      );
    }

    if (view.name === 'supportCreate') {
      return (
        <SupportCreateForm
          token={token}
          onCreated={(ticket) => setView({ name: 'supportTicket', id: ticket.id })}
          onCancel={() => setView({ name: 'support' })}
        />
      );
    }

    if (user.role === 'blogger') {
      if (view.name === 'myResponses') {
        return <MyResponses token={token} onOpenLot={goToLot} />;
      }
      if (view.name === 'savedSearches') {
        return <SavedSearches token={token} />;
      }
      return <BloggerHome token={token} onOpenLot={goToLot} />;
    }

    // company
    if (view.name === 'createLot') {
      return (
        <CreateLotForm
          token={token}
          onCreated={() => {
            setLotsRefresh((k) => k + 1);
            setView({ name: 'home' });
          }}
          onCancel={() => setView({ name: 'home' })}
        />
      );
    }

    return (
      <CompanyHome
        token={token}
        user={user}
        refreshKey={lotsRefresh}
        onOpenLot={goToLot}
      />
    );
  }

  // Blogger: 5 tabs, no FAB
  const bloggerItems = [
    { key: 'feed',      label: 'Лента',      icon: <HomeIcon size={24} />,      active: view.name === 'home' },
    { key: 'responses', label: 'Отклики',    icon: <Send size={24} />,          active: view.name === 'myResponses' },
    { key: 'searches',  label: 'Поиски',     icon: <Bookmark size={24} />,      active: view.name === 'savedSearches' },
    { key: 'support',   label: 'Поддержка',  icon: <LifeBuoy size={24} />,      active: view.name === 'support' },
    { key: 'profile',   label: 'Профиль',    icon: <User size={24} />,          active: view.name === 'profile' },
  ];

  // Company: 3 tabs + center FAB
  const companyItems = [
    { key: 'home',    label: 'Заявки',     icon: <ClipboardList size={24} />, active: view.name === 'home' },
    { key: 'support', label: 'Поддержка',  icon: <LifeBuoy size={24} />,      active: view.name === 'support' },
    { key: 'profile', label: 'Профиль',    icon: <User size={24} />,          active: view.name === 'profile' },
  ];
  const companyFab = { key: 'create', label: 'Создать', icon: <Plus size={22} color="#fff" /> };

  const { title, subtitle } = getHeaderConfig(view, user);

  // Nested screens: no chrome
  if (!isRoot) {
    return (
      <div style={{ height: '100vh', overflowY: 'auto' }}>
        {renderContent()}
      </div>
    );
  }

  // Root screens: ScreenHeader + scrollable content + BottomTabBar
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <ScreenHeader title={title} subtitle={subtitle} user={user} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {renderContent()}
      </div>
      <BottomTabBar
        items={user.role === 'blogger' ? bloggerItems : companyItems}
        onTabChange={handleTabChange}
        fab={user.role === 'company' ? companyFab : undefined}
      />
    </div>
  );
}
