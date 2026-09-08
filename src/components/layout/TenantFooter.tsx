import React from 'react';
import { Globe, Mail, MapPin, Headphones, ShieldCheck } from 'lucide-react';
import { useBrandInfo, MizanLogo } from '../design-system/MizanLogo';
import { useAppStore } from '../../lib/store';

export const TenantFooter: React.FC = () => {
  const { language } = useAppStore();
  const ar = language === 'ar';
  const brand = useBrandInfo();
  const { placements } = brand;

  const hasContact = placements.showFooterContact && (brand.phoneNumber || brand.supportEmail);
  const hasAddress = placements.showFooterAddress && (ar ? brand.addressArabic : brand.address || brand.addressArabic);
  const hasWebsite = placements.showFooterWebsite && brand.websiteUrl;
  const slogan = ar ? (brand.sloganArabic || brand.slogan) : (brand.slogan || brand.sloganArabic);

  return (
    <footer className="mt-16 border-t border-[#DFDED7] bg-[#FAF9F5] text-[#4a504c] text-xs print:hidden">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-[#E8E6DF]">
          {/* هوية الجهة وشعارها */}
          <div className="space-y-1.5 max-w-lg">
            <div className="flex items-center gap-3">
              <MizanLogo language={language} compact tone="brand" />
            </div>
            {slogan && (
              <p className="text-[11px] text-[#6b726d] font-medium leading-relaxed">
                {slogan}
              </p>
            )}
          </div>

          {/* روابط وبيانات التواصل المعتمدة وفق خيارات الجهة */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-medium text-[#4a504c]">
            {hasWebsite && (
              <a
                href={brand.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-[#214C40] transition"
              >
                <Globe className="w-3.5 h-3.5 text-[#2F6555]" />
                <span>{brand.websiteUrl?.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span>
              </a>
            )}

            {hasContact && brand.phoneNumber && (
              <a
                href={`tel:${brand.phoneNumber}`}
                className="inline-flex items-center gap-1.5 hover:text-[#214C40] transition"
              >
                <Headphones className="w-3.5 h-3.5 text-[#2F6555]" />
                <span dir="ltr">{brand.phoneNumber}</span>
              </a>
            )}

            {hasContact && brand.supportEmail && (
              <a
                href={`mailto:${brand.supportEmail}`}
                className="inline-flex items-center gap-1.5 hover:text-[#214C40] transition"
              >
                <Mail className="w-3.5 h-3.5 text-[#2F6555]" />
                <span>{brand.supportEmail}</span>
              </a>
            )}

            {hasAddress && (
              <div className="inline-flex items-center gap-1.5 text-[#656b66]">
                <MapPin className="w-3.5 h-3.5 text-[#9B7542]" />
                <span>{ar ? brand.addressArabic : (brand.address || brand.addressArabic)}</span>
              </div>
            )}
          </div>
        </div>

        {/* سطر الحقوق والاعتماد */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] text-[#656b66]">
          <div>
            © {new Date().getFullYear()} {ar ? brand.ar : brand.en}. {ar ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}
          </div>
          <div className="inline-flex items-center gap-1.5 text-[#636864]">
            <ShieldCheck className="w-3 h-3 text-[#2F6555]" />
            <span>{ar ? 'مدعوم بنظام ميزان المحكَّم للمسابقات القرآنية' : 'Powered by MIZAN Quranic Competition Infrastructure'}</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
