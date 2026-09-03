// Fill these in with your own Supabase project values.
// Project Settings -> API in the Supabase dashboard.
// Both values below are public/safe to expose in client-side code.
const SUPABASE_URL = "https://ucpnbsftxocrwksfvtvc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_q2XnhHq_3gFJs0f3K8nVGA_noxKD7R7";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
