import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PillTabGroup } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { AttendanceGrid } from './components/AttendanceGrid';
import { SalaryTab } from './components/SalaryTab';
import { StockTab } from './components/StockTab';
import { TasksTab } from './components/TasksTab';

type TabId = 'employees' | 'salary' | 'stock' | 'tasks';

const PATH_TO_TAB: Record<string, TabId> = {
  [ROUTES.ATELIE_EMPLOYEES]: 'employees',
  [ROUTES.ATELIE_SALARY]: 'salary',
  [ROUTES.ATELIE_STOCK]: 'stock',
  [ROUTES.ATELIE_TASKS]: 'tasks',
};

const TAB_TO_PATH: Record<TabId, string> = {
  employees: ROUTES.ATELIE_EMPLOYEES,
  salary: ROUTES.ATELIE_SALARY,
  stock: ROUTES.ATELIE_STOCK,
  tasks: ROUTES.ATELIE_TASKS,
};

export default function AteliePage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>(
    () => PATH_TO_TAB[location.pathname] ?? 'employees',
  );

  const TABS = useMemo(
    () => [
      { id: 'employees', label: t('atelie.tabs.employees') },
      { id: 'salary', label: t('atelie.tabs.salary') },
      { id: 'stock', label: t('atelie.tabs.stock') },
      { id: 'tasks', label: t('atelie.tabs.tasks') },
    ],
    [t],
  );

  useEffect(() => {
    const fromPath = PATH_TO_TAB[location.pathname];
    if (fromPath && fromPath !== activeTab) setActiveTab(fromPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  function handleTabChange(id: string) {
    const next = id as TabId;
    setActiveTab(next);
    const path = TAB_TO_PATH[next];
    if (path && path !== location.pathname) navigate(path, { replace: false });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">{t('atelie.page.title')}</h1>
        <p className="text-xs text-gray-400">{t('atelie.page.subtitle')}</p>
      </div>

      <div className="mb-5">
        <PillTabGroup tabs={TABS} activeTab={activeTab} onChange={handleTabChange} />
      </div>

      {activeTab === 'employees' && <AttendanceGrid />}
      {activeTab === 'salary' && <SalaryTab />}
      {activeTab === 'stock' && <StockTab />}
      {activeTab === 'tasks' && <TasksTab />}
    </div>
  );
}
