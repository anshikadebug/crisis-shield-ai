import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

type CrisisStatus = 'Reported' | 'Verified' | 'In Progress' | 'Solved';
type CrisisType = 'Garbage Dump' | 'Water Leakage' | 'Air Pollution' | 'Blocked Drain' | 'Illegal Dumping' | 'Other';
type Urgency = 'Low' | 'Medium' | 'High';
type FilterType = 'All' | 'High Urgency' | CrisisType | 'Solved';
type AppMode = 'Citizen' | 'Volunteer';

interface CrisisReport {
  id: number;
  title: string;
  type: CrisisType;
  area: string;
  description: string;
  latitude: number;
  longitude: number;
  urgency: Urgency;
  status: CrisisStatus;
  upvotes: number;
  photoUrl: string;
  afterPhotoUrl: string;
  createdAt: string;
}

interface ReportForm {
  title: string;
  type: CrisisType;
  area: string;
  description: string;
  urgency: Urgency;
  latitude: number | null;
  longitude: number | null;
  photoUrl: string;
}

const STORAGE_KEY = 'crisis-shield-reports';

const SAMPLE_REPORTS: CrisisReport[] = [
  {
    id: 1,
    title: 'Overflowing garbage near bus stop',
    type: 'Garbage Dump',
    area: 'Market Road',
    description: 'Waste is blocking the sidewalk and attracting flies. Needs quick cleanup.',
    latitude: 18.522,
    longitude: 73.856,
    urgency: 'High',
    status: 'Verified',
    upvotes: 34,
    photoUrl: '',
    afterPhotoUrl: '',
    createdAt: '2026-05-24'
  },
  {
    id: 2,
    title: 'Water leakage outside school gate',
    type: 'Water Leakage',
    area: 'Lake View Colony',
    description: 'Clean water has been leaking continuously since morning.',
    latitude: 18.532,
    longitude: 73.872,
    urgency: 'Medium',
    status: 'In Progress',
    upvotes: 19,
    photoUrl: '',
    afterPhotoUrl: '',
    createdAt: '2026-05-26'
  },
  {
    id: 3,
    title: 'Smoke from open waste burning',
    type: 'Air Pollution',
    area: 'Industrial Lane',
    description: 'Plastic waste is being burned in the open area behind the workshop.',
    latitude: 18.511,
    longitude: 73.884,
    urgency: 'High',
    status: 'Reported',
    upvotes: 47,
    photoUrl: '',
    afterPhotoUrl: '',
    createdAt: '2026-05-27'
  },
  {
    id: 4,
    title: 'Drain blocked after rain',
    type: 'Blocked Drain',
    area: 'Green Park',
    description: 'Water is collecting near houses because the drain is clogged.',
    latitude: 18.548,
    longitude: 73.842,
    urgency: 'Medium',
    status: 'Reported',
    upvotes: 13,
    photoUrl: '',
    afterPhotoUrl: '',
    createdAt: '2026-05-28'
  },
  {
    id: 5,
    title: 'Second waste report near Market Road',
    type: 'Illegal Dumping',
    area: 'Market Road',
    description: 'Construction waste dumped near the old bus shelter.',
    latitude: 18.525,
    longitude: 73.861,
    urgency: 'Medium',
    status: 'Reported',
    upvotes: 11,
    photoUrl: '',
    afterPhotoUrl: '',
    createdAt: '2026-05-28'
  }
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly crisisTypes: CrisisType[] = ['Garbage Dump', 'Water Leakage', 'Air Pollution', 'Blocked Drain', 'Illegal Dumping', 'Other'];
  readonly statuses: CrisisStatus[] = ['Reported', 'Verified', 'In Progress', 'Solved'];
  readonly urgencyLevels: Urgency[] = ['Low', 'Medium', 'High'];
  readonly filters: FilterType[] = ['All', 'High Urgency', 'Garbage Dump', 'Water Leakage', 'Air Pollution', 'Blocked Drain', 'Illegal Dumping', 'Other', 'Solved'];
  private readonly supabase: SupabaseClient | null = environment.supabaseUrl && environment.supabaseAnonKey
    ? createClient(environment.supabaseUrl, environment.supabaseAnonKey)
    : null;

  reports = signal<CrisisReport[]>(this.loadLocalReports());
  selectedReportId = signal<number>(this.reports()[0]?.id ?? 0);
  activeFilter = signal<FilterType>('All');
  appMode = signal<AppMode>('Citizen');
  locationMessage = signal('');
  imageMessage = signal('');
  afterImageMessage = signal('');
  syncMessage = signal(this.supabase ? 'Supabase sync ready.' : 'Local demo mode. Add free Supabase keys to sync online.');

  form = signal<ReportForm>({
    title: '',
    type: 'Garbage Dump',
    area: '',
    description: '',
    urgency: 'Medium',
    latitude: null,
    longitude: null,
    photoUrl: ''
  });

  private map?: L.Map;
  private markers = L.layerGroup();

  selectedReport = computed(() => {
    return this.reports().find((report) => report.id === this.selectedReportId()) ?? this.reports()[0];
  });

  filteredReports = computed(() => {
    const filter = this.activeFilter();
    return this.reports().filter((report) => {
      if (filter === 'All') {
        return true;
      }
      if (filter === 'High Urgency') {
        return report.urgency === 'High';
      }
      if (filter === 'Solved') {
        return report.status === 'Solved';
      }
      return report.type === filter;
    });
  });

  sortedReports = computed(() => {
    return [...this.filteredReports()].sort((a, b) => this.shieldPriorityScore(b) - this.shieldPriorityScore(a));
  });

  activeReports = computed(() => this.reports().filter((report) => report.status !== 'Solved').length);
  solvedReports = computed(() => this.reports().filter((report) => report.status === 'Solved').length);
  totalUpvotes = computed(() => this.reports().reduce((total, report) => total + report.upvotes, 0));
  highUrgencyReports = computed(() => this.reports().filter((report) => report.urgency === 'High' && report.status !== 'Solved').length);
  wasteCases = computed(() => this.reports().filter((report) => report.type === 'Garbage Dump' || report.type === 'Illegal Dumping').length);
  waterRiskCases = computed(() => this.reports().filter((report) => report.type === 'Water Leakage' || report.type === 'Blocked Drain').length);
  pollutionCases = computed(() => this.reports().filter((report) => report.type === 'Air Pollution').length);
  mostAffectedArea = computed(() => this.areaCounts()[0]?.area ?? 'No area yet');
  communityAlert = computed(() => {
    const alertArea = this.areaCounts().find((item) => item.count >= 2);
    return alertArea ? `Community Alert: ${alertArea.count} reports near ${alertArea.area}` : 'No repeated crisis clusters detected.';
  });

  async ngOnInit(): Promise<void> {
    await this.loadSupabaseReports();
  }

  ngAfterViewInit(): void {
    this.initMap();
    this.refreshMap();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  async submitReport(): Promise<void> {
    const value = this.form();

    if (!value.title.trim() || !value.area.trim() || !value.description.trim()) {
      this.locationMessage.set('Please add a title, area, and short description before submitting.');
      return;
    }

    const report: CrisisReport = {
      id: Date.now(),
      title: value.title.trim(),
      type: value.type,
      area: value.area.trim(),
      description: value.description.trim(),
      latitude: value.latitude ?? 18.52 + Math.random() * 0.04,
      longitude: value.longitude ?? 73.84 + Math.random() * 0.05,
      urgency: value.urgency,
      status: 'Reported',
      upvotes: 1,
      photoUrl: value.photoUrl,
      afterPhotoUrl: '',
      createdAt: new Date().toISOString().slice(0, 10)
    };

    this.reports.update((reports) => [report, ...reports]);
    this.selectedReportId.set(report.id);
    await this.persistReport(report);
    this.resetForm();
    this.locationMessage.set('Report added to the Crisis Map.');
    this.refreshMap();
  }

  updateForm<K extends keyof ReportForm>(key: K, value: ReportForm[K]): void {
    this.form.update((current) => ({ ...current, [key]: value }));
  }

  setFilter(filter: FilterType): void {
    this.activeFilter.set(filter);
    const firstReport = this.filteredReports()[0];
    if (firstReport) {
      this.selectedReportId.set(firstReport.id);
    }
    this.refreshMap();
  }

  setMode(mode: AppMode): void {
    this.appMode.set(mode);
  }

  useCurrentLocation(): void {
    if (!navigator.geolocation) {
      this.locationMessage.set('Location is not available in this browser.');
      return;
    }

    this.locationMessage.set('Getting your location...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.form.update((current) => ({
          ...current,
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6))
        }));
        this.locationMessage.set('Location added.');
      },
      () => {
        this.locationMessage.set('Location permission was blocked. You can still submit using demo coordinates.');
      }
    );
  }

  async uploadPhoto(event: Event): Promise<void> {
    const url = await this.uploadImage(event);
    if (!url) {
      return;
    }
    this.form.update((current) => ({ ...current, photoUrl: url }));
    this.imageMessage.set(environment.cloudinaryCloudName ? 'Photo uploaded.' : 'Photo attached locally.');
  }

  async uploadAfterPhoto(event: Event, reportId: number): Promise<void> {
    const url = await this.uploadImage(event);
    if (!url) {
      return;
    }
    this.reports.update((reports) =>
      reports.map((report) => report.id === reportId ? { ...report, afterPhotoUrl: url, status: 'Solved' } : report)
    );
    const report = this.reports().find((item) => item.id === reportId);
    if (report) {
      await this.persistReport(report);
    }
    this.afterImageMessage.set('After photo added and report marked solved.');
    this.refreshMap();
  }

  async upvote(reportId: number): Promise<void> {
    this.reports.update((reports) =>
      reports.map((report) => report.id === reportId ? { ...report, upvotes: report.upvotes + 1 } : report)
    );
    const report = this.reports().find((item) => item.id === reportId);
    if (report) {
      await this.persistReport(report);
    }
    this.refreshMap();
  }

  async updateStatus(reportId: number, status: CrisisStatus): Promise<void> {
    this.reports.update((reports) =>
      reports.map((report) => report.id === reportId ? { ...report, status } : report)
    );
    const report = this.reports().find((item) => item.id === reportId);
    if (report) {
      await this.persistReport(report);
    }
    this.refreshMap();
  }

  selectReport(reportId: number): void {
    this.selectedReportId.set(reportId);
    const report = this.reports().find((item) => item.id === reportId);
    if (report && this.map) {
      this.map.setView([report.latitude, report.longitude], 14);
    }
  }

  shieldPriorityScore(report: CrisisReport): number {
    const urgencyScore = report.urgency === 'High' ? 35 : report.urgency === 'Medium' ? 20 : 8;
    const statusScore = report.status === 'Reported' ? 16 : report.status === 'Verified' ? 22 : report.status === 'In Progress' ? 10 : 0;
    const riskScore: Record<CrisisType, number> = {
      'Air Pollution': 28,
      'Water Leakage': 22,
      'Blocked Drain': 20,
      'Illegal Dumping': 20,
      'Garbage Dump': 16,
      Other: 10
    };
    const ageInDays = Math.max(0, Math.floor((Date.now() - new Date(report.createdAt).getTime()) / 86_400_000));
    return report.upvotes + urgencyScore + statusScore + riskScore[report.type] + Math.min(ageInDays * 2, 20);
  }

  statusClass(status: CrisisStatus): string {
    return status.toLowerCase().replace(/\s+/g, '-');
  }

  private initMap(): void {
    if (this.map) {
      return;
    }

    this.map = L.map('crisis-map', {
      center: [18.525, 73.86],
      zoom: 13,
      scrollWheelZoom: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    this.markers.addTo(this.map);
  }

  private refreshMap(): void {
    if (!this.map) {
      return;
    }

    this.markers.clearLayers();
    const reports = this.filteredReports();

    reports.forEach((report) => {
      const marker = L.marker([report.latitude, report.longitude], {
        icon: L.divIcon({
          className: `crisis-marker ${report.status === 'Solved' ? 'marker-solved' : ''}`,
          html: `<span>${report.type.charAt(0)}</span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        })
      });

      marker.bindPopup(`
        <strong>${report.title}</strong><br>
        ${report.area}<br>
        Priority: ${this.shieldPriorityScore(report)}
      `);
      marker.on('click', () => this.selectedReportId.set(report.id));
      marker.addTo(this.markers);
    });

    if (reports.length) {
      const bounds = L.latLngBounds(reports.map((report) => [report.latitude, report.longitude]));
      this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }

  private async loadSupabaseReports(): Promise<void> {
    if (!this.supabase) {
      return;
    }

    const { data, error } = await this.supabase.from('reports').select('*').order('created_at', { ascending: false });
    if (error || !data?.length) {
      this.syncMessage.set(error ? 'Supabase table not ready. Using local demo data.' : 'No Supabase reports yet. Using local demo data.');
      return;
    }

    const reports = data.map((row: any) => this.fromSupabaseRow(row));
    this.reports.set(reports);
    this.selectedReportId.set(reports[0]?.id ?? 0);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
    this.syncMessage.set('Reports loaded from Supabase.');
    this.refreshMap();
  }

  private async persistReport(report: CrisisReport): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.reports()));

    if (!this.supabase) {
      this.syncMessage.set('Saved locally. Add free Supabase keys to sync online.');
      return;
    }

    const { error } = await this.supabase.from('reports').upsert(this.toSupabaseRow(report));
    this.syncMessage.set(error ? 'Saved locally. Supabase sync failed.' : 'Synced with Supabase.');
  }

  private async uploadImage(event: Event): Promise<string> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return '';
    }

    if (environment.cloudinaryCloudName && environment.cloudinaryUploadPreset) {
      const payload = new FormData();
      payload.append('file', file);
      payload.append('upload_preset', environment.cloudinaryUploadPreset);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${environment.cloudinaryCloudName}/image/upload`, {
        method: 'POST',
        body: payload
      });
      const data = await response.json();
      return data.secure_url ?? '';
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
  }

  private areaCounts(): Array<{ area: string; count: number }> {
    const counts = this.reports().reduce<Record<string, number>>((result, report) => {
      if (report.status !== 'Solved') {
        result[report.area] = (result[report.area] ?? 0) + 1;
      }
      return result;
    }, {});

    return Object.entries(counts)
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count);
  }

  private loadLocalReports(): CrisisReport[] {
    const storedReports = localStorage.getItem(STORAGE_KEY);
    return storedReports ? JSON.parse(storedReports) as CrisisReport[] : SAMPLE_REPORTS;
  }

  private resetForm(): void {
    this.form.set({
      title: '',
      type: 'Garbage Dump',
      area: '',
      description: '',
      urgency: 'Medium',
      latitude: null,
      longitude: null,
      photoUrl: ''
    });
    this.imageMessage.set('');
  }

  private toSupabaseRow(report: CrisisReport): Record<string, unknown> {
    return {
      id: report.id,
      title: report.title,
      issue_type: report.type,
      area: report.area,
      description: report.description,
      latitude: report.latitude,
      longitude: report.longitude,
      urgency: report.urgency,
      status: report.status,
      upvotes: report.upvotes,
      photo_url: report.photoUrl,
      after_photo_url: report.afterPhotoUrl,
      created_at: report.createdAt
    };
  }

  private fromSupabaseRow(row: any): CrisisReport {
    return {
      id: row.id,
      title: row.title,
      type: row.issue_type,
      area: row.area,
      description: row.description,
      latitude: row.latitude,
      longitude: row.longitude,
      urgency: row.urgency,
      status: row.status,
      upvotes: row.upvotes,
      photoUrl: row.photo_url ?? '',
      afterPhotoUrl: row.after_photo_url ?? '',
      createdAt: row.created_at?.slice?.(0, 10) ?? row.created_at
    };
  }
}
