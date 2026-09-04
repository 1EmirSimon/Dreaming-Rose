// js/supabase.js

const SUPABASE_URL = 'https://nqrolhsojifnaaptibgk.supabase.co';

const SUPABASE_ANON_KEY = 'sb_publishable_8YrcFmkTtiuoJVzlBZYMmw_GGuBhpwd'; 

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);