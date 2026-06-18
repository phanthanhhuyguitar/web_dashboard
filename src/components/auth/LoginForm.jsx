import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { authApi } from '../../api/authApi.js';
import { getSafeErrorMessage } from '../../utils/error.js';
import { clearRememberedLoginId, getRememberedLoginId, setAccessToken, setRememberedLoginId } from '../../utils/storage.js';

const fallbackError = 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.';

function getTokenFromResponse(responseData) {
  const data = responseData?.data ?? responseData;

  return (
    data?.accessToken ||
    data?.access_token ||
    data?.token ||
    data?.data?.accessToken ||
    data?.data?.access_token ||
    data?.data?.token ||
    ''
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState({
    phone: getRememberedLoginId(),
    password: '',
    totp: '',
    rememberLogin: Boolean(getRememberedLoginId()),
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const updateField = (event) => {
    const { name, value, checked, type } = event.target;

    setFormValues((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));

    setFieldErrors((current) => ({
      ...current,
      [name]: '',
    }));
    setSubmitError('');
  };

  const validateForm = () => {
    const errors = {};

    if (!formValues.phone.trim()) {
      errors.phone = 'Vui lòng nhập tài khoản hoặc số điện thoại';
    }

    if (!formValues.password.trim()) {
      errors.password = 'Vui lòng nhập mật khẩu';
    }

    if (!formValues.totp.trim()) {
      errors.totp = 'Vui lòng nhập mã OTP/TOTP';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await authApi.login({
        phone: formValues.phone.trim(),
        password: formValues.password,
        totp: formValues.totp.trim(),
      });
      const token = getTokenFromResponse(response.data);

      if (!token) {
        throw new Error(fallbackError);
      }

      const phone = formValues.phone.trim();

      setAccessToken(token, formValues.rememberLogin);

      if (formValues.rememberLogin) {
        setRememberedLoginId(phone);
      } else {
        clearRememberedLoginId();
      }

      navigate('/dashboard', { replace: true });
    } catch (error) {
      setSubmitError(getSafeErrorMessage(error, fallbackError));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="login-card" onSubmit={handleSubmit} noValidate>
      <div className="login-card-header">
        <p>TNEX Partner Admin Dashboard</p>
        <h2>Đăng nhập hệ thống</h2>
      </div>

      <div className="form-field">
        <label htmlFor="phone">Tài khoản / Số điện thoại</label>
        <input
          id="phone"
          name="phone"
          type="text"
          autoComplete="username"
          value={formValues.phone}
          onChange={updateField}
          aria-invalid={Boolean(fieldErrors.phone)}
        />
        {fieldErrors.phone ? <span className="field-error">{fieldErrors.phone}</span> : null}
      </div>

      <div className="form-field">
        <label htmlFor="password">Mật khẩu</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={formValues.password}
          onChange={updateField}
          aria-invalid={Boolean(fieldErrors.password)}
        />
        {fieldErrors.password ? <span className="field-error">{fieldErrors.password}</span> : null}
      </div>

      <div className="form-field">
        <label htmlFor="totp">Mã OTP/TOTP</label>
        <input
          id="totp"
          name="totp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={formValues.totp}
          onChange={updateField}
          aria-invalid={Boolean(fieldErrors.totp)}
        />
        {fieldErrors.totp ? <span className="field-error">{fieldErrors.totp}</span> : null}
      </div>

      <label className="remember-row">
        <input
          name="rememberLogin"
          type="checkbox"
          checked={formValues.rememberLogin}
          onChange={updateField}
        />
        <span>Ghi nhớ đăng nhập</span>
      </label>

      {submitError ? <div className="submit-error">{submitError}</div> : null}

      <button className="primary-button" type="submit" disabled={isLoading}>
        {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
      </button>
    </form>
  );
}

export default LoginForm;
