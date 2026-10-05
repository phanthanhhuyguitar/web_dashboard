import { useAppSettings } from '../../context/AppSettingsContext.jsx';

// Nen trang tri toan app - vai anh sang mo drift cham + vignette + film grain nhe, tao cam giac
// "dien anh". Thuan CSS (khong can JS animate) nen rat nhe, dat 1 lan o goc App.jsx.
// Luu y: .cinematic-bg luon giu 1 nen dac theo tong trang (xem CSS) ke ca khi tat trong Cai
// dat - vi .dashboard-main/.dashboard-shell phia truoc dang de trong suot mot phan de lop nay
// hien ra, neu bo han lop nay se lo mau nen goc cua the html phia sau (sai theo dark mode).
function CinematicBackground() {
  const { settings } = useAppSettings();
  const enabled = settings.cinematicBackgroundEnabled;

  return (
    <div className="cinematic-bg" aria-hidden="true">
      {enabled ? (
        <>
          <span className="cinematic-bg-blob cinematic-bg-blob-1" />
          <span className="cinematic-bg-blob cinematic-bg-blob-2" />
          <span className="cinematic-bg-blob cinematic-bg-blob-3" />
          <span className="cinematic-bg-vignette" />
          <span className="cinematic-bg-grain" />
        </>
      ) : null}
    </div>
  );
}

export default CinematicBackground;
