import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

webpush.setVapidDetails(
  'mailto:admin@nhacuongthuoc.local',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function getVietnamTimeHHMM() {
  const now = new Date();
  const vnString = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return vnString.slice(0, 5);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const isTest = searchParams.get('test') === '1';

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Sai mã bảo mật' }, { status: 401 });
  }

  try {
    const { data: subs } = await supabase.from('push_subscriptions').select('*');
    if (!subs || subs.length === 0) {
      return NextResponse.json({ message: 'Chưa có thiết bị nào đăng ký nhận thông báo' });
    }

    let payload = null;

    if (isTest) {
      payload = JSON.stringify({
        title: 'Thử Chuông Thành Công',
        body: 'Hệ thống thông báo từ đám mây đã kết nối chuẩn với iPhone!',
        tag: 'test-bell',
      });
    } else {
      const currentHHMM = getVietnamTimeHHMM();
      const { data: meds } = await supabase.from('medications').select('*');

      const dueMeds = (meds || []).filter(
        (m) => Array.isArray(m.times) && m.times.includes(currentHHMM)
      );

      if (dueMeds.length === 0) {
        return NextResponse.json({ time: currentHHMM, sent: 0 });
      }

      const title =
        dueMeds.length === 1
          ? `${currentHHMM} • ${dueMeds[0].name} (${dueMeds[0].dosage})`
          : `${currentHHMM} • Đến giờ uống ${dueMeds.length} loại thuốc`;

      const body = dueMeds
        .map((m) => `• ${m.name} (${m.dosage} - ${m.meal_note})`)
        .join('\n');

      payload = JSON.stringify({
        title,
        body,
        tag: `med-${currentHHMM}`,
      });
    }

    let sentCount = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
        sentCount++;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    return NextResponse.json({ success: true, sent: sentCount });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}