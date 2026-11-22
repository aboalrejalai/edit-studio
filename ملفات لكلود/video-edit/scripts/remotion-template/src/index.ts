import {registerRoot} from 'remotion';
import {FONTS, WINPC} from './font';
import {RemotionRoot} from './Root';
/* ويندوز: الجذر ينسجل بعد ما تتحمل الخطوط (FONTS). قبلها كل تبويب ريموشن يرسم اول فريم له وتحميل الخط شغال، وCaptions.tsx
   يقسم الاسطر بقياس canvas وقت الرسم ولا يعيده، فاول فريم ببعض التبويبات يطلع كرت كابشن باسطر غلط (يتغير من رندر لرندر).
   الماك يسجله فورا كما كان. */
if (WINPC) FONTS.then(() => registerRoot(RemotionRoot)); else registerRoot(RemotionRoot);
