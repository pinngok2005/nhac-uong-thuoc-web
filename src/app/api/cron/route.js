import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const isTest = searchParams.get('test') === '1';

    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    webpush.setVapidDetails(
      'mailto:admin@nhacuongthuoc.app',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim(),
      process.env.VAPID_PRIVATE_KEY.trim()
    );

    const { data: subs, error: subErr } = await supabase.from('push_subscriptions').select('*');
    if (subErr) throw new Error('Lỗi đọc push_subscriptions: ' + subErr.message);

    if (!subs || subs.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        reason: 'Bang push_subscriptions dang trong (0 thiet bi)',
      });
    }

    const nowVN = new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    });
    const todayVN = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

    let messages = [];

    if (isTest) {
      messages.push({
        title: 'Kiểm tra chuông thành công!',
        body: `Hệ thống nhắc uống thuốc đã kết nối chuẩn (Giờ VN: ${nowVN})`,
      });
    } else {
      const { data: meds, error: medErr } = await supabase.from('medications').select('*');
      if (medErr) throw new Error('Lỗi đọc medications: ' + medErr.message);

      for (const med of meds || []) {
        const takenToday = med.last_reset_date === todayVN ? med.taken_today || [] : [];
        if ((med.times || []).includes(nowVN) && !takenToday.includes(nowVN)) {
          messages.push({
            title: `Đến giờ uống thuốc (${nowVN})`,
            body: `${med.name} - ${med.dosage} (${med.meal_note})`,
          });
        }
      }
    }

    if (messages.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        currentTimeVN: nowVN,
        reason: 'Chua den gio uong thuoc nao',
      });
    }

    let sentCount = 0;
    const pushErrors = [];

    for (const sub of subs) {
      const pushConfig = { endpoint: sub.endpoint, keys: sub.keys };
      for (const msg of messages) {
        try {
          await webpush.sendNotification(pushConfig, JSON.stringify(msg));
          sentCount++;
        } catch (err) {
          pushErrors.push(err.message);
          if (err.statusCode === 410 || err.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      currentTimeVN: nowVN,
      errors: pushErrors,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}