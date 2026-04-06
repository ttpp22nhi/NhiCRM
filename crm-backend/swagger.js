import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUiExpress from 'swagger-ui-express';
const { serve, setup } = swaggerUiExpress;

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CRM MobiFone API',
      version: '1.0.0',
      description: 'API Documentation cho hệ thống CRM MobiFone',
      contact: {
        name: 'CRM MobiFone',
        email: 'support@crm-alpha.vn',
      },
    },
    servers: (() => {
      const port = process.env.PORT || 3000;
      const list = [
        { url: `http://localhost:${port}`, description: 'Localhost' },
      ];
      const alternate = process.env.PUBLIC_API_BASE_URL || process.env.SWAGGER_SERVER_URL;
      if (alternate && String(alternate).trim()) {
        list.push({ url: String(alternate).trim().replace(/\/$/, ''), description: 'IP / Domain' });
      }
      return list;
    })(),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Nhập JWT token với format: Bearer <token>',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Lỗi xảy ra',
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: {
              type: 'string',
              example: 'admin',
              description: 'Tên đăng nhập',
            },
            password: {
              type: 'string',
              example: '123456@Admin',
              description: 'Mật khẩu',
            },
            domain: {
              type: 'string',
              example: 'tenant1',
              description: 'Domain công ty (tenant).  Có thể lấy từ subdomain hoặc gửi trong body. Để trống nếu đăng nhập Super Admin.',
            },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              example: 'Đăng nhập thành công!',
            },
            token: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
            employee: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                full_name: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string', enum: ['super_admin', 'admin', 'director', 'manager', 'leader', 'sales'] },
                tenant_id: { type: 'string', nullable: true },
              },
            },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['username', 'password', 'full_name', 'email'],
          properties: {
            username: { type: 'string', example: 'sales1' },
            password: { type: 'string', example: 'password123' },
            full_name: { type: 'string', example: 'Nguyễn Văn A' },
            email: { type: 'string', example: 'sales1@example.com' },
            role: { type: 'string', enum: ['super_admin', 'admin', 'director', 'manager', 'leader', 'sales'], example: 'sales' },
            department_id: { type: 'string', nullable: true },
            title: { type: 'string', nullable: true },
            rank: { type: 'string', nullable: true },
          },
        },
        Customer: {
          type: 'object',
          properties: {
            customer_id: { type: 'string' },
            full_name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            address: { type: 'string' },
            customer_type: { type: 'string' },
            company_name: { type: 'string' },
            tax_code: { type: 'string' },
            source: { type: 'string' },
            assigned_to: { type: 'string' },
            created_at: { type: 'integer', format: 'int64' },
            updated_at: { type: 'integer', format: 'int64' },
          },
        },
        Employee: {
          type: 'object',
          properties: {
            employee_id: { type: 'string' },
            username: { type: 'string' },
            full_name: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string', enum: ['super_admin', 'admin', 'director', 'manager', 'leader', 'sales'] },
            department_id: { type: 'string', nullable: true },
            title: { type: 'string', nullable: true },
            rank: { type: 'string', nullable: true },
            is_active: { type: 'boolean' },
            created_at: { type: 'integer', format: 'int64' },
          },
        },
        Interaction: {
          type: 'object',
          properties: {
            interaction_id: { type: 'string' },
            customer_id: { type: 'string' },
            deal_id: { type: 'string', nullable: true },
            interaction_type: { type: 'string', description: 'Loại tương tác (call, email, meeting, note, etc.)' },
            content: { type: 'string' },
            interaction_date: { type: 'integer', format: 'int64' },
            employee_id: { type: 'string' },
            status: { type: 'string', nullable: true },
            created_at: { type: 'integer', format: 'int64' },
            employee_full_name: { type: 'string', description: 'Tên nhân viên (từ JOIN với employees)' },
            employee_username: { type: 'string', description: 'Username nhân viên (từ JOIN với employees)' },
            employee_email: { type: 'string', description: 'Email nhân viên (từ JOIN với employees)' },
            employee_role: { type: 'string', description: 'Vai trò nhân viên (từ JOIN với employees)' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./server.js', './controllers/*.js'], // Đường dẫn đến các file chứa JSDoc comments
};

const swaggerSpec = swaggerJsdoc(options);

export { swaggerSpec, serve as swaggerServe, setup as swaggerSetup };

