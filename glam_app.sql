-- --------------------------------------------------------
-- Nombre de la Base de Datos: `glam_app`
--
-- NOTA: Si ya tienes una base de datos con este nombre,
-- elimina la línea "DROP DATABASE IF EXISTS `glam_app`;"
-- y las líneas "CREATE DATABASE IF NOT EXISTS `glam_app`...".
-- --------------------------------------------------------

DROP DATABASE IF EXISTS `glam_app`;
CREATE DATABASE IF NOT EXISTS `glam_app` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `glam_app`;

--
-- Estructura de la tabla `products`
-- Almacena el catálogo de la tienda
--

CREATE TABLE `products` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `price` DECIMAL(10, 2) NOT NULL,
  `description` TEXT NOT NULL,
  `image_url` VARCHAR(255) NOT NULL,
  `video_id` VARCHAR(50) DEFAULT NULL, -- ID de YouTube para tutorial
  `stock` INT NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Volcado de datos para la tabla `products` (Datos de tu product.html)
--

INSERT INTO `products` (`id`, `name`, `price`, `description`, `image_url`, `video_id`, `stock`, `is_active`) VALUES
('labial', 'Labial Mate (Elixir)', 25.00, 'Labial de acabado mate, larga duración, tonos intensos y cómodo al aplicar.', 'lipstick.png', 'NAmTEy0BFmQ', 50, TRUE),
('sombras', 'Paleta de Sombras (Aurora)', 70.00, 'Paleta con 12 tonos mate y brillantes, perfecta para looks de día y noche.', 'sombras.png', 'tYokIAmRqc4', 30, TRUE),
('base', 'Base de Maquillaje (HD)', 50.00, 'Base líquida HD para un acabado natural y cobertura ajustable.', 'base.png', '5TgXjvPfgUo', 45, TRUE),
('vaso', 'Vaso Rayo Macuin', 25.00, 'Vaso coleccionable con diseño Rayo Macuin, ideal para regalo.', 'macuin.png', 'BH0E76oozIc', 100, TRUE);


--
-- Estructura de la tabla `users`
-- Almacena información básica de los usuarios registrados (por ejemplo, vía Google Sign-In)
--

CREATE TABLE `users` (
  `user_id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `name` VARCHAR(255) DEFAULT NULL,
  `picture_url` VARCHAR(512) DEFAULT NULL,
  `is_admin` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


--
-- Estructura de la tabla `settings`
-- Almacena credenciales y configuraciones sensibles (como las de Twilio)
--

CREATE TABLE `settings` (
  `key_name` VARCHAR(50) NOT NULL PRIMARY KEY,
  `value` TEXT NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `is_secret` BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Volcado de datos para la tabla `settings` (Datos de tu credenciales.env)
--

INSERT INTO `settings` (`key_name`, `value`, `description`, `is_secret`) VALUES
('TWILIO_ACCOUNT_SID', 'ACba86a7552b154780fb3cfe82afcd877f', 'Twilio Account SID', TRUE),
('TWILIO_AUTH_TOKEN', 'cc2b53b14f73c02b25bc2565957088ea', 'Twilio Auth Token', TRUE),
('TWILIO_PHONE_NUMBER', '+16812412593', 'Número de teléfono de Twilio de origen', FALSE);

--
-- Tabla adicional recomendada para e-commerce: `orders`
-- Almacena información de los pedidos realizados
--

CREATE TABLE `orders` (
  `order_id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_email` VARCHAR(255) NOT NULL,
  `total_amount` DECIMAL(10, 2) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE CASCADE ON DELETE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;