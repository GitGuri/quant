import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Space,
  Select,
  DatePicker,
  Spin,
  Alert,
  Typography,
  Divider,
  Input,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import dayjs, { Dayjs } from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const API_BASE = 'https://quantnow-sa1e.onrender.com'; // adjust if API is on another host

// ===== Types =====
interface PlatformSummary {
  total_companies: number;
  total_users: number;
  new_companies_this_month: number;
  new_users_this_month: number;
  active_companies_30d: number;
  active_users_30d: number;
  logins_24h: number; // total requests today
  logins_7d: number;
  logins_30d: number;
}

interface LoginPoint {
  day: string; // date (YYYY-MM-DD)
  login_count: number; // distinct users that day (DAU)
  request_count: number; // total tracked requests that day
}

interface ResourceUsage {
  resource_key: string;
  total_used: number;
}

interface CompanyUsage {
  company_owner_user_id: string;
  company: string | null;
  owner_name: string | null;
  owner_email: string | null;
  plan: string | null;
  plan_status: string | null;
  company_created_at: string | null;
  total_users: number;
  active_users_window: number;
  logins_window: number; // total requests in window
  last_login_at: string | null; // last_seen_at
  total_resource_used: number;
}

interface TodayLoginUser {
  user_id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  request_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

// ===== Helper: auth header =====
const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
};

const PlatformUsageDashboard: React.FC = () => {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [logins, setLogins] = useState<LoginPoint[]>([]);
  const [resources, setResources] = useState<ResourceUsage[]>([]);
  const [companies, setCompanies] = useState<CompanyUsage[]>([]);
  const [todayLogins, setTodayLogins] = useState<TodayLoginUser[]>([]);

  const [rangeDays, setRangeDays] = useState<number>(30);
  const [monthKey, setMonthKey] = useState<string>(dayjs().format('YYYY-MM'));

  const [companySearch, setCompanySearch] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('all');

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        summaryRes,
        loginsRes,
        resourcesRes,
        companiesRes,
        todayLoginsRes,
      ] = await Promise.all([
        fetch(`${API_BASE}/api/admin/analytics/platform/summary`, {
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
        }),
        fetch(
          `${API_BASE}/api/admin/analytics/platform/logins?rangeDays=${rangeDays}`,
          {
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders(),
            },
          }
        ),
        fetch(
          `${API_BASE}/api/admin/analytics/platform/resources?monthKey=${monthKey}`,
          {
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders(),
            },
          }
        ),
        fetch(
          `${API_BASE}/api/admin/analytics/platform/companies?rangeDays=${rangeDays}`,
          {
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders(),
            },
          }
        ),
        fetch(`${API_BASE}/api/admin/analytics/platform/logins/today`, {
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
        }),
      ]);

      if (
        !summaryRes.ok ||
        !loginsRes.ok ||
        !resourcesRes.ok ||
        !companiesRes.ok ||
        !todayLoginsRes.ok
      ) {
        throw new Error('Failed to load one or more analytics endpoints');
      }

      const summaryJson = (await summaryRes.json()) as PlatformSummary;
      const loginsJson = (await loginsRes.json()) as LoginPoint[];
      const resourcesJson = (await resourcesRes.json()) as ResourceUsage[];
      const companiesJson = (await companiesRes.json()) as CompanyUsage[];
      const todayLoginsJson = (await todayLoginsRes.json()) as TodayLoginUser[];

      setSummary(summaryJson);
      setLogins(loginsJson);
      setResources(resourcesJson);
      setCompanies(companiesJson);
      setTodayLogins(todayLoginsJson);
    } catch (e: any) {
      console.error('Platform usage load error', e);
      setError(e.message || 'Failed to load platform usage');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays, monthKey]);

  // ===== Derived data =====

  const totalFeatureUsage = useMemo(
    () => resources.reduce((sum, r) => sum + r.total_used, 0),
    [resources]
  );

  const resourcesWithShare = useMemo(
    () =>
      resources.map((r) => ({
        ...r,
        share:
          totalFeatureUsage > 0
            ? Number(((r.total_used / totalFeatureUsage) * 100).toFixed(1))
            : 0,
      })),
    [resources, totalFeatureUsage]
  );

  const dauToday = todayLogins.length;
  const requestsToday = summary?.logins_24h ?? 0;
  const requestsPerActiveUserToday =
    dauToday > 0 ? Number((requestsToday / dauToday).toFixed(1)) : 0;

  const userEngagementRate =
    summary && summary.total_users > 0
      ? Number(
          ((summary.active_users_30d / summary.total_users) * 100).toFixed(1)
        )
      : 0;

  const companyEngagementRate =
    summary && summary.total_companies > 0
      ? Number(
          (
            (summary.active_companies_30d / summary.total_companies) *
            100
          ).toFixed(1)
        )
      : 0;

  const avgDailyActiveUsers = useMemo(() => {
    if (!logins.length) return 0;
    const total = logins.reduce((s, p) => s + (p.login_count || 0), 0);
    return Number((total / logins.length).toFixed(1));
  }, [logins]);

  const avgDailyRequests = useMemo(() => {
    if (!logins.length) return 0;
    const total = logins.reduce((s, p) => s + (p.request_count || 0), 0);
    return Number((total / logins.length).toFixed(1));
  }, [logins]);

  const windowLabel = useMemo(() => {
    if (rangeDays === 7) return 'Last 7 days';
    if (rangeDays === 30) return 'Last 30 days';
    if (rangeDays === 90) return 'Last 90 days';
    return `Last ${rangeDays} days`;
  }, [rangeDays]);

  const topFeature = resourcesWithShare[0] || null;

  const topCompanyByRequests = useMemo(
    () =>
      companies.length
        ? [...companies].sort(
            (a, b) => (b.logins_window || 0) - (a.logins_window || 0)
          )[0]
        : null,
    [companies]
  );

  const topCompanyByActiveUsers = useMemo(
    () =>
      companies.length
        ? [...companies].sort(
            (a, b) =>
              (b.active_users_window || 0) - (a.active_users_window || 0)
          )[0]
        : null,
    [companies]
  );

  const powerUsersToday = useMemo(
    () => todayLogins.filter((u) => u.request_count >= 20).length,
    [todayLogins]
  );

  // Filter companies for table
  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      const matchesPlan =
        planFilter === 'all' ||
        (c.plan || '').toLowerCase() === planFilter.toLowerCase();
      const search = companySearch.trim().toLowerCase();
      const matchesSearch =
        !search ||
        (c.company || '').toLowerCase().includes(search) ||
        (c.owner_name || '').toLowerCase().includes(search) ||
        (c.owner_email || '').toLowerCase().includes(search);
      return matchesPlan && matchesSearch;
    });
  }, [companies, planFilter, companySearch]);

  // ===== Charts config =====

  const loginsChartOptions = useMemo<Highcharts.Options>(
    () => ({
      title: { text: 'Daily active users & requests' },
      subtitle: { text: windowLabel },
      xAxis: {
        categories: logins.map((p) => dayjs(p.day).format('DD MMM')),
        title: { text: 'Day' },
      },
      yAxis: [
        {
          title: { text: 'Active users (DAU)' },
          allowDecimals: false,
        },
        {
          title: { text: 'Requests' },
          allowDecimals: false,
          opposite: true,
        },
      ],
      series: [
        {
          type: 'line',
          name: 'Active users',
          data: logins.map((p) => p.login_count),
          yAxis: 0,
        },
        {
          type: 'column',
          name: 'Requests',
          data: logins.map((p) => p.request_count),
          yAxis: 1,
        },
      ],
      tooltip: {
        shared: true,
        formatter: function () {
          const idx = (this.points?.[0]?.point as any)?.index ?? 0;
          const item = logins[idx];
          return `
            <b>${dayjs(item.day).format('YYYY-MM-DD')}</b><br/>
            Active users: ${item.login_count}<br/>
            Requests: ${item.request_count}
          `;
        },
      },
    }),
    [logins, windowLabel]
  );

  const resourcesChartOptions = useMemo<Highcharts.Options>(
    () => ({
      chart: { type: 'column' },
      title: { text: `Feature usage (${monthKey})` },
      xAxis: {
        categories: resourcesWithShare.map((r) => r.resource_key),
        title: { text: 'Feature' },
        labels: { style: { fontSize: '10px' } },
      },
      yAxis: {
        title: { text: 'Times used' },
        allowDecimals: false,
      },
      series: [
        {
          type: 'column',
          name: 'Total used',
          data: resourcesWithShare.map((r) => r.total_used),
        },
      ],
      tooltip: {
        formatter: function () {
          const idx = (this.point as any).index;
          const item = resourcesWithShare[idx];
          return `<b>${item.resource_key}</b><br/>Used: ${item.total_used}<br/>Share: ${item.share}%`;
        },
      },
    }),
    [resourcesWithShare, monthKey]
  );

  // ===== Table config =====

  const companyColumns: ColumnsType<CompanyUsage> = [
    {
      title: 'Company',
      dataIndex: 'company',
      key: 'company',
      render: (val, record) => (
        <>
          <div>{val || <Text type="secondary">(No name)</Text>}</div>
          {record.plan && (
            <Tag
              color={
                record.plan.toLowerCase().includes('pro')
                  ? 'green'
                  : record.plan.toLowerCase().includes('basic')
                  ? 'blue'
                  : 'default'
              }
              style={{ marginTop: 4 }}
            >
              {record.plan}
            </Tag>
          )}
        </>
      ),
      sorter: (a, b) => (a.company || '').localeCompare(b.company || ''),
    },
    {
      title: 'Owner',
      dataIndex: 'owner_name',
      key: 'owner_name',
      render: (val, record) =>
        val ? (
          <>
            <div>{val}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.owner_email}
            </Text>
          </>
        ) : (
          <Text type="secondary">{record.owner_email || '-'}</Text>
        ),
      sorter: (a, b) => (a.owner_name || '').localeCompare(b.owner_name || ''),
    },
    {
      title: 'Seats',
      dataIndex: 'total_users',
      key: 'total_users',
      sorter: (a, b) => a.total_users - b.total_users,
      render: (val, record) => (
        <Tooltip
          title={`Active in window: ${record.active_users_window}/${val} users`}
        >
          <span>
            {val}{' '}
            <Text type="secondary" style={{ fontSize: 11 }}>
              ({record.active_users_window} active)
            </Text>
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Requests (window)',
      dataIndex: 'logins_window',
      key: 'logins_window',
      sorter: (a, b) => a.logins_window - b.logins_window,
      render: (val, record) => {
        const perActive =
          record.active_users_window > 0
            ? (val / record.active_users_window).toFixed(1)
            : '0.0';
        return (
          <Tooltip title={`~${perActive} requests per active user`}>
            <span>{val}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Feature calls (month)',
      dataIndex: 'total_resource_used',
      key: 'total_resource_used',
      sorter: (a, b) => a.total_resource_used - b.total_resource_used,
    },
    {
      title: 'Last activity',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      render: (val) => {
        if (!val) return <Text type="secondary">—</Text>;
        const d = dayjs(val);
        const diffDays = dayjs().diff(d, 'day');
        let color: 'green' | 'orange' | 'red' = 'green';
        if (diffDays > 30) color = 'red';
        else if (diffDays > 7) color = 'orange';
        return (
          <Space direction="vertical" size={0}>
            <span>{d.format('YYYY-MM-DD HH:mm')}</span>
            <Tag color={color} style={{ marginTop: 2 }}>
              {diffDays === 0
                ? 'Today'
                : diffDays === 1
                ? 'Yesterday'
                : `${diffDays} days ago`}
            </Tag>
          </Space>
        );
      },
      sorter: (a, b) =>
        dayjs(a.last_login_at || 0).valueOf() -
        dayjs(b.last_login_at || 0).valueOf(),
    },
    {
      title: 'Onboarded',
      dataIndex: 'company_created_at',
      key: 'company_created_at',
      render: (val) =>
        val ? dayjs(val).format('YYYY-MM-DD') : <Text type="secondary">-</Text>,
      sorter: (a, b) =>
        dayjs(a.company_created_at || 0).valueOf() -
        dayjs(b.company_created_at || 0).valueOf(),
    },
  ];

  const todayLoginsColumns: ColumnsType<TodayLoginUser> = [
    {
      title: 'User',
      dataIndex: 'name',
      key: 'name',
      render: (val, record) => (
        <>
          <div>{val || record.email || '(Unknown user)'}</div>
          {record.email && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.email}
            </Text>
          )}
        </>
      ),
    },
    {
      title: 'Company',
      dataIndex: 'company',
      key: 'company',
      render: (val) => val || <Text type="secondary">-</Text>,
    },
    {
      title: 'Requests today',
      dataIndex: 'request_count',
      key: 'request_count',
      sorter: (a, b) => a.request_count - b.request_count,
      render: (val) =>
        val >= 50 ? (
          <Tag color="magenta">{val}</Tag>
        ) : val >= 20 ? (
          <Tag color="purple">{val}</Tag>
        ) : (
          val
        ),
    },
    {
      title: 'First seen',
      dataIndex: 'first_seen_at',
      key: 'first_seen_at',
      render: (val) => dayjs(val).format('HH:mm'),
      sorter: (a, b) =>
        dayjs(a.first_seen_at).valueOf() - dayjs(b.first_seen_at).valueOf(),
    },
    {
      title: 'Last activity',
      dataIndex: 'last_seen_at',
      key: 'last_seen_at',
      render: (val) => dayjs(val).format('HH:mm'),
      sorter: (a, b) =>
        dayjs(a.last_seen_at).valueOf() - dayjs(b.last_seen_at).valueOf(),
    },
  ];

  const handleRangeChange = (value: number) => {
    setRangeDays(value);
  };

  const handleMonthChange = (value: Dayjs | null) => {
    if (!value) return;
    setMonthKey(value.format('YYYY-MM'));
  };

  const distinctPlans = useMemo(
    () =>
      Array.from(
        new Set(
          companies
            .map((c) => c.plan?.trim())
            .filter(Boolean)
            .map((p) => p as string)
        )
      ).sort(),
    [companies]
  );

  return (
    <Spin spinning={loading}>
      <div style={{ padding: 16 }}>
        {/* Header + filters */}
        <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
          <Col>
            <Title level={3} style={{ marginBottom: 0 }}>
              Platform Usage
            </Title>
            <Text type="secondary">
              Internal view of tenants, engagement, and feature adoption.
            </Text>
          </Col>
          <Col>
            <Space wrap>
              <span>Window:</span>
              <Select<number>
                value={rangeDays}
                style={{ width: 140 }}
                onChange={handleRangeChange}
              >
                <Option value={7}>Last 7 days</Option>
                <Option value={30}>Last 30 days</Option>
                <Option value={90}>Last 90 days</Option>
              </Select>

              <span>Month:</span>
              <DatePicker
                picker="month"
                allowClear={false}
                value={dayjs(monthKey + '-01')}
                onChange={handleMonthChange}
              />
            </Space>
          </Col>
        </Row>

        {error && (
          <Alert
            type="error"
            message="Failed to load platform usage"
            description={error}
            style={{ marginBottom: 16 }}
            showIcon
          />
        )}

        {/* Overview section */}
        <Divider orientation="left">Overview</Divider>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Total companies"
                value={summary?.total_companies ?? 0}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Root accounts / tenants
              </Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic title="Total users" value={summary?.total_users ?? 0} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                All active seats
              </Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="New companies (this month)"
                value={summary?.new_companies_this_month ?? 0}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="New users (this month)"
                value={summary?.new_users_this_month ?? 0}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Active companies (30d)"
                value={summary?.active_companies_30d ?? 0}
                valueStyle={{
                  color: companyEngagementRate > 60 ? '#3f8600' : undefined,
                }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {companyEngagementRate
                  ? `${companyEngagementRate}% of companies active`
                  : '—'}
              </Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Active users (30d)"
                value={summary?.active_users_30d ?? 0}
                valueStyle={{
                  color: userEngagementRate > 40 ? '#3f8600' : undefined,
                }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {userEngagementRate
                  ? `${userEngagementRate}% of users active`
                  : '—'}
              </Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Avg DAU"
                value={avgDailyActiveUsers}
                precision={1}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Avg daily active users ({windowLabel})
              </Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <Statistic
                title="Avg daily requests"
                value={avgDailyRequests}
                precision={1}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Avg tracked requests ({windowLabel})
              </Text>
            </Card>
          </Col>
        </Row>

        {/* Key signals */}
        <Divider orientation="left">Key signals</Divider>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} md={8}>
            <Card size="small">
              <Text type="secondary">Most active tenant (by requests)</Text>
              <div style={{ marginTop: 4 }}>
                {topCompanyByRequests ? (
                  <>
                    <div style={{ fontWeight: 500 }}>
                      {topCompanyByRequests.company || '(No name)'}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {topCompanyByRequests.logins_window} requests /{' '}
                      {topCompanyByRequests.active_users_window} active users
                    </Text>
                  </>
                ) : (
                  <Text type="secondary">No usage yet.</Text>
                )}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Text type="secondary">Most adopted feature</Text>
              <div style={{ marginTop: 4 }}>
                {topFeature ? (
                  <>
                    <div style={{ fontWeight: 500 }}>
                      {topFeature.resource_key}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {topFeature.total_used} calls ({topFeature.share}% of
                      total)
                    </Text>
                  </>
                ) : (
                  <Text type="secondary">No feature usage tracked.</Text>
                )}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Text type="secondary">Power users today</Text>
              <div style={{ marginTop: 4 }}>
                <Statistic
                  value={powerUsersToday}
                  suffix={`/ ${dauToday} active`}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Users with ≥ 20 requests today
                </Text>
              </div>
            </Card>
          </Col>
        </Row>

        {/* Today snapshot */}
        <Divider orientation="left">Today&apos;s activity</Divider>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={8}>
            <Card size="small">
              <Statistic title="Active users today" value={dauToday} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Distinct users seen today
              </Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card size="small">
              <Statistic title="Requests today" value={requestsToday} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Total tracked requests (all tenants)
              </Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card size="small">
              <Statistic
                title="Requests / active user"
                value={requestsPerActiveUserToday}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Engagement depth today
              </Text>
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col span={24}>
            <Card
              title={`Users active today (${todayLogins.length})`}
              size="small"
            >
              {todayLogins.length === 0 ? (
                <Text type="secondary">No activity recorded so far today.</Text>
              ) : (
                <Table<TodayLoginUser>
                  size="small"
                  dataSource={todayLogins}
                  rowKey="user_id"
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  columns={todayLoginsColumns}
                />
              )}
            </Card>
          </Col>
        </Row>

        {/* Engagement + feature usage */}
        <Divider orientation="left">Engagement & Features</Divider>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} md={14}>
            <Card title="Daily active users vs requests">
              {logins.length === 0 ? (
                <Text type="secondary">No activity data for selected range.</Text>
              ) : (
                <HighchartsReact
                  highcharts={Highcharts}
                  options={loginsChartOptions}
                />
              )}
            </Card>
          </Col>
          <Col xs={24} md={10}>
            <Card
              title={
                <Space direction="vertical" size={0}>
                  <span>Feature usage</span>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    How often each functionality is called in {monthKey}
                  </Text>
                </Space>
              }
            >
              {resourcesWithShare.length === 0 ? (
                <Text type="secondary">
                  No feature usage tracked for selected month.
                </Text>
              ) : (
                <>
                  <HighchartsReact
                    highcharts={Highcharts}
                    options={resourcesChartOptions}
                  />
                  <Divider style={{ margin: '12px 0' }} />
                  <Table
                    size="small"
                    dataSource={resourcesWithShare}
                    rowKey="resource_key"
                    pagination={false}
                    columns={[
                      {
                        title: 'Feature',
                        dataIndex: 'resource_key',
                        key: 'resource_key',
                      },
                      {
                        title: 'Used',
                        dataIndex: 'total_used',
                        key: 'total_used',
                        width: 80,
                      },
                      {
                        title: '% of total',
                        dataIndex: 'share',
                        key: 'share',
                        width: 100,
                        render: (val: number) => `${val}%`,
                      },
                    ]}
                  />
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Total feature calls this month: {totalFeatureUsage}
                    </Text>
                  </div>
                </>
              )}
            </Card>
          </Col>
        </Row>

        {/* Companies table */}
        <Divider orientation="left">Tenants</Divider>
        <Card
          title="Companies usage overview"
          extra={
            <Space size="middle">
              <Input
                placeholder="Search company or owner…"
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                allowClear
                style={{ width: 220 }}
              />
              <Select
                value={planFilter}
                onChange={(val) => setPlanFilter(val)}
                style={{ width: 160 }}
              >
                <Option value="all">All plans</Option>
                {distinctPlans.map((p) => (
                  <Option key={p} value={p}>
                    {p}
                  </Option>
                ))}
              </Select>
            </Space>
          }
        >
          <Table<CompanyUsage>
            dataSource={filteredCompanies}
            columns={companyColumns}
            rowKey="company_owner_user_id"
            pagination={{ pageSize: 10, showSizeChanger: true }}
            size="middle"
          />
        </Card>
      </div>
    </Spin>
  );
};

export default PlatformUsageDashboard;
