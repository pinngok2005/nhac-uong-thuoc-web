'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Sun,
  Sunrise,
  CloudSun,
  Moon,
  Sparkles,
  Bell,
  Plus,
  Check,
  Trash2,
  Pill,
  Clock,
  X,
} from 'lucide-react';

const TIME_ZONES = [
  { id: 'sang', title: 'Sáng', range: '06:00 - 11:00', icon: Sunrise, quick: ['06:30', '07:00', '08:00', '09:30'] },
  { id: 'trua', title: 'Trưa', range: '11:00 - 13:30', icon: Sun, quick: ['11:30', '12:00', '12:30', '13:00'] },
  { id: 'chieu', title: 'Chiều', range: '13:30 - 17:00', icon: CloudSun, quick: ['14:00', '15:00', '16:00', '16:30'] },
  { id: 'toi', title: 'Tối', range: '17:00 - 24:00', icon: Moon, quick: ['18:00', '19:30', '21:00', '22:30'] },
  { id: 'dem', title: 'Đêm', range: '24:00 - 05:00', icon: Sparkles, quick: ['00:30', '01:30', '03:00', '04:30'] },
];

const MEAL_NOTES = ['Sau ăn', 'Trước ăn', 'Trong bữa ăn', 'Tự do'];

function getZoneId(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const mins = h * 60 + m;
  if (mins >= 300 && mins < 660) return 'sang';
  if (mins >= 660 && mins <= 810) return 'trua';
  if (mins > 810 && mins < 1020) return 'chieu';
  if (mins >= 1020 && mins <= 1439) return 'toi';
  return 'dem';
}

function getTodayVN() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function Home() {
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('today');
  const [modalOpen, setModalOpen] = useState(false);
  const [pushReady, setPushReady] = useState(false);
  const [todayStr, setTodayStr] = useState('');

  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('1 viên');
  const [mealNote, setMealNote] = useState('Sau ăn');
  const [stock, setStock] = useState('30');
  const [selectedTimes, setSelectedTimes] = useState(['08:00']);
  const [customTime, setCustomTime] = useState('07:30');

  useEffect(() => {
    setTodayStr(getTodayVN());
    fetchMeds();
    checkPushStatus();
  }, []);

  const checkPushStatus = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      if (sub) setPushReady(true);
    }
  };

  const enablePushNotifications = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Trên iPhone, bạn phải bấm Chia sẻ -> Thêm vào Màn hình chính rồi mở app từ icon đó mới bật được thông báo!');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        alert('Bạn đã chặn thông báo. Hãy vào Cài đặt iPhone để bật lại.');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await reg.update();
      await navigator.serviceWorker.ready;

      // Hủy đăng ký cũ (nếu có) để tránh kẹt khóa VAPID cũ trên iOS
      const existingSub = await reg.pushManager.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
      }

      const vapidKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Không lưu được đăng ký thông báo lên server');
      }

      setPushReady(true);
      await reg.showNotification('Đã kết nối chuông!', {
        body: 'Thông báo trên iPhone của bạn đã hoạt động.',
      });
      alert('Đã làm mới và bật chuông thành công! Bạn vừa thấy thông báo thử hiện lên chứ?');
    } catch (err) {
      alert('Lỗi bật thông báo: ' + err.message);
    }
  };

  const testLocalNotification = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Kiểm tra chuông iPhone!', {
        body: 'Nếu thấy dòng này là iPhone đã cho phép hiện thông báo.',
      });
    } catch (err) {
      alert('Lỗi bắn thử thông báo: ' + err.message);
    }
  };

  const fetchMeds = async () => {
    setLoading(true);
    const today = getTodayVN();
    const { data, error } = await supabase.from('medications').select('*').order('name');
    if (error) {
      alert('Lỗi tải danh sách thuốc: ' + error.message);
      setLoading(false);
      return;
    }
    if (data) {
      const normalized = await Promise.all(
        data.map(async (med) => {
          if (med.last_reset_date !== today) {
            await supabase
              .from('medications')
              .update({ taken_today: [], last_reset_date: today })
              .eq('id', med.id);
            return { ...med, taken_today: [], last_reset_date: today };
          }
          return med;
        })
      );
      setMeds(normalized);
    }
    setLoading(false);
  };

  const handleAddMed = async (e) => {
    if (e) e.preventDefault();
    if (saving) return;

    if (!name.trim()) {
      alert('Bạn chưa nhập tên thuốc!');
      return;
    }
    if (selectedTimes.length === 0) {
      alert('Bạn phải chọn ít nhất 1 giờ uống!');
      return;
    }

    setSaving(true);
    try {
      const today = getTodayVN();
      const { data, error } = await supabase
        .from('medications')
        .insert([
          {
            name: name.trim(),
            dosage: dosage.trim() || '1 viên',
            meal_note: mealNote,
            stock: parseInt(stock, 10) || 0,
            times: [...selectedTimes].sort(),
            taken_today: [],
            last_reset_date: today,
          },
        ])
        .select();

      if (error) {
        alert('Lỗi Supabase: ' + error.message);
        setSaving(false);
        return;
      }

      if (data && data.length > 0) {
        setMeds([...meds, data[0]]);
        setName('');
        setSelectedTimes(['08:00']);
        setModalOpen(false);
      } else {
        alert('Không nhận được dữ liệu trả về từ Supabase!');
      }
    } catch (err) {
      alert('Lỗi kết nối: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleTaken = async (med, timeStr) => {
    const takenList = med.taken_today || [];
    const isTaken = takenList.includes(timeStr);
    const nextTaken = isTaken
      ? takenList.filter((t) => t !== timeStr)
      : [...takenList, timeStr];
    const nextStock = isTaken ? med.stock + 1 : Math.max(0, med.stock - 1);

    setMeds(
      meds.map((m) =>
        m.id === med.id ? { ...m, taken_today: nextTaken, stock: nextStock } : m
      )
    );

    const { error } = await supabase
      .from('medications')
      .update({ taken_today: nextTaken, stock: nextStock })
      .eq('id', med.id);

    if (error) {
      alert('Lỗi cập nhật trạng thái: ' + error.message);
    }
  };

  const deleteMed = async (id) => {
    if (!confirm('Xóa thuốc này khỏi danh sách?')) return;
    setMeds(meds.filter((m) => m.id !== id));
    const { error } = await supabase.from('medications').delete().eq('id', id);
    if (error) {
      alert('Lỗi xóa thuốc: ' + error.message);
    }
  };

  const toggleTime = (t) => {
    setSelectedTimes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort()
    );
  };

  const allDoses = [];
  meds.forEach((med) => {
    (med.times || []).forEach((t) => {
      allDoses.push({
        key: `${med.id}_${t}`,
        time: t,
        zoneId: getZoneId(t),
        med,
        taken: (med.taken_today || []).includes(t),
      });
    });
  });
  allDoses.sort((a, b) => a.time.localeCompare(b.time));

  const doneCount = allDoses.filter((d) => d.taken).length;
  const percent = allDoses.length > 0 ? Math.round((doneCount / allDoses.length) * 100) : 0;

  return (
    <div className="max-w-md mx-auto min-h-screen pb-28 px-4 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-slate-500">Hôm nay {todayStr ? `• ${todayStr}` : ''}</p>
          <h1 className="text-2xl font-extrabold text-slate-900">Lịch Uống Thuốc</h1>
        </div>
        <div className="flex items-center gap-1.5">
          {pushReady && (
            <button
              type="button"
              onClick={testLocalNotification}
              className="px-2.5 py-2 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300"
            >
              Thử chuông
            </button>
          )}
          <button
            type="button"
            onClick={enablePushNotifications}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold border transition ${
              pushReady
                ? 'bg-teal-50 text-teal-700 border-teal-200'
                : 'bg-amber-50 text-amber-700 border-amber-300 animate-pulse'
            }`}
          >
            <Bell className="w-4 h-4" />
            {pushReady ? 'Làm mới chuông' : 'Bật chuông'}
          </button>
        </div>
      </div>

      {/* Thẻ tiến độ */}
      <div className="bg-teal-600 text-white rounded-2xl p-5 shadow-md shadow-teal-600/20 mb-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="text-teal-100 text-xs font-semibold">Tiến độ hôm nay</p>
            <p className="text-2xl font-extrabold mt-0.5">
              {doneCount}/{allDoses.length}{' '}
              <span className="text-sm font-normal text-teal-100">liều thuốc</span>
            </p>
          </div>
          <span className="bg-white/20 px-3 py-1.5 rounded-xl font-extrabold text-sm">
            {percent}%
          </span>
        </div>
        <div className="w-full h-2 bg-white/25 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 bg-slate-200/80 p-1 rounded-xl mb-5">
        <button
          type="button"
          onClick={() => setTab('today')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold transition ${
            tab === 'today' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          <Clock className="w-4 h-4" /> 5 Khung giờ
        </button>
        <button
          type="button"
          onClick={() => setTab('cabinet')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold transition ${
            tab === 'cabinet' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          <Pill className="w-4 h-4" /> Tủ thuốc ({meds.length})
        </button>
      </div>

      {/* Nội dung */}
      {loading ? (
        <p className="text-center text-slate-400 py-10 text-sm">Đang đồng bộ dữ liệu...</p>
      ) : tab === 'today' ? (
        <div className="space-y-3.5">
          {TIME_ZONES.map((zone) => {
            const Icon = zone.icon;
            const zoneDoses = allDoses.filter((d) => d.zoneId === zone.id);
            return (
              <div key={zone.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-slate-900 text-base">{zone.title}</h2>
                    <p className="text-xs text-slate-500 font-medium">{zone.range}</p>
                  </div>
                </div>

                {zoneDoses.length === 0 ? (
                  <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">Trống lịch</p>
                ) : (
                  <div className="divide-y divide-slate-100 mt-2">
                    {zoneDoses.map((item) => (
                      <div
                        key={item.key}
                        onClick={() => toggleTaken(item.med, item.time)}
                        className={`flex items-center py-3 cursor-pointer transition ${
                          item.taken ? 'opacity-50' : ''
                        }`}
                      >
                        <span className="bg-slate-100 border border-slate-200 text-teal-700 font-extrabold text-sm px-2.5 py-1 rounded-lg mr-3">
                          {item.time}
                        </span>
                        <div className="flex-1">
                          <p
                            className={`font-bold text-slate-900 text-sm ${
                              item.taken ? 'line-through text-slate-400' : ''
                            }`}
                          >
                            {item.med.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.med.dosage} • {item.med.meal_note} • Còn {item.med.stock}
                          </p>
                        </div>
                        <div
                          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${
                            item.taken
                              ? 'bg-teal-600 border-teal-600 text-white'
                              : 'border-slate-300'
                          }`}
                        >
                          {item.taken && <Check className="w-4 h-4" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {meds.map((med) => (
            <div key={med.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex justify-between items-center">
                <h3 className="font-extrabold text-slate-900">{med.name}</h3>
                <button
                  type="button"
                  onClick={() => deleteMed(med.id)}
                  className="p-2 bg-red-50 text-red-500 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Liều: <b>{med.dosage}</b> ({med.meal_note}) • Kho còn: <b>{med.stock}</b>
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {(med.times || []).map((t) => (
                  <span
                    key={t}
                    className="text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-1 rounded-md"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Nút thêm thuốc */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F4F6F9]/90 backdrop-blur-sm max-w-md mx-auto">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white font-extrabold py-3.5 rounded-2xl shadow-lg shadow-teal-600/25 flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" /> Thêm thuốc mới
        </button>
      </div>

      {/* Modal thêm thuốc */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
          <form
            onSubmit={handleAddMed}
            className="bg-[#F4F6F9] w-full max-w-md rounded-t-3xl max-h-[90vh] overflow-y-auto p-5"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-500 p-1"
              >
                <X className="w-6 h-6" />
              </button>
              <h2 className="font-extrabold text-base">Thêm Thuốc Mới</h2>
              <button
                type="button"
                disabled={saving}
                onClick={handleAddMed}
                className="text-teal-600 font-extrabold text-sm px-2 py-1 disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên thuốc *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Vitamin C, Thuốc dạ dày..."
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Liều lượng</label>
                  <input
                    value={dosage}
                    onChange={(e) => setDosage(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số viên có</label>
                  <input
                    type="number"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Cách uống</label>
                <div className="flex flex-wrap gap-2">
                  {MEAL_NOTES.map((note) => (
                    <button
                      type="button"
                      key={note}
                      onClick={() => setMealNote(note)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                        mealNote === note
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      {note}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Chọn giờ nhắc (nhiều giờ/ngày)
                </label>
                <div className="space-y-2">
                  {TIME_ZONES.map((z) => (
                    <div key={z.id} className="bg-white p-3 rounded-xl border border-slate-200">
                      <p className="text-xs font-bold text-slate-600 mb-2">
                        {z.title} ({z.range})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {z.quick.map((t) => (
                          <button
                            type="button"
                            key={t}
                            onClick={() => toggleTime(t)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                              selectedTimes.includes(t)
                                ? 'bg-teal-600 text-white border-teal-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Hoặc chọn giờ lẻ bất kỳ
                </label>
                <div className="flex gap-2">
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => toggleTime(customTime)}
                    className="bg-teal-600 text-white font-bold text-xs px-4 rounded-xl"
                  >
                    + Thêm giờ
                  </button>
                </div>
              </div>

              <div className="bg-teal-50 border border-teal-200 p-3 rounded-xl">
                <p className="text-xs font-bold text-teal-800 mb-1.5">
                  Đã chọn ({selectedTimes.length} cử):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTimes.map((t) => (
                    <span
                      key={t}
                      onClick={() => toggleTime(t)}
                      className="bg-teal-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg cursor-pointer"
                    >
                      {t} ✕
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}